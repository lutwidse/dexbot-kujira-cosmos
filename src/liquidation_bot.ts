import { registry } from 'kujira.js';
import { GasPrice, SigningStargateClient, coins } from '@cosmjs/stargate';
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
const { toUtf8 } = require('@cosmjs/encoding');
import Decimal from 'decimal.js';
import {
  msg_claim_liquidations,
  msg_submit_bid,
  msg_swap
} from './kujira_wrapper';
import {
  RPC_ENDPOINT,
  MNEMONIC,
  DENOM_AMOUNT,
  ORCA_MARKET_USK_ATOM_CONTRACT,
  USK_DENOM,
  LCD_ENDPOINT
} from './config';
const axios = require('axios');
import { Logger } from 'tslog';
import { appendFileSync } from 'fs';

import axiosRetry from 'axios-retry';

export class Bot {
  signer: DirectSecp256k1HdWallet;
  client: SigningStargateClient;
  cosmwasmClient: CosmWasmClient;
  signerAddress: string;
  logger: Logger<any>;
  axiosClient: any;

  constructor(
    signer: DirectSecp256k1HdWallet,
    client: SigningStargateClient,
    cosmwasmClient: CosmWasmClient,
    signerAddress: string
  ) {
    this.signer = signer;
    this.client = client;
    this.cosmwasmClient = cosmwasmClient;
    this.signerAddress = signerAddress;
    this.logger = new Logger({});
    this.logger.attachTransport((logObj) => {
      appendFileSync('logs.txt', JSON.stringify(logObj) + '\n');
    });
    this.logger.settings.type = 'json';
    this.logger.settings.prettyLogTemplate =
      '{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}\t{{logLevelName}}\t[{{filePathWithLine}}\t{{name}}]';

    this.axiosClient = axios.create();
    axiosRetry(this.axiosClient, {
      retryDelay: (retryCount) => {
        return retryCount * 10000;
      }
    });
  }

  async swap(atom: number, contract: string, denom: string) {
    const tx = await this.client.signAndBroadcast(
      this.signerAddress,
      [
        {
          typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
          value: MsgExecuteContract.fromPartial({
            sender: this.signerAddress,
            contract: contract,
            msg: toUtf8(JSON.stringify(msg_swap())),
            funds: coins(new Decimal(atom).mul(DENOM_AMOUNT).toFixed(), denom)
          })
        }
      ],
      'auto'
    );

    this.logger.info({
      swap: {
        atom: `${atom}`,
        usk: `${new Decimal(tx.events[14].attributes[3].value).div(
          DENOM_AMOUNT
        )}}`
      }
    });
  }

  async submitBid(premium: number, bid_amount: number) {
    await this.client.signAndBroadcast(
      this.signerAddress,
      [
        {
          typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
          value: MsgExecuteContract.fromPartial({
            sender: this.signerAddress,
            contract: ORCA_MARKET_USK_ATOM_CONTRACT,
            msg: toUtf8(JSON.stringify(msg_submit_bid(premium))),
            funds: coins(
              new Decimal(bid_amount).mul(DENOM_AMOUNT).toFixed(),
              USK_DENOM
            )
          })
        }
      ],
      'auto'
    );

    this.logger.info({ bid: { usk: `${bid_amount}}` } });
  }

  async claimLiquidations(idxs: string[]) {
    const tx = await this.client.signAndBroadcast(
      this.signerAddress,
      [
        {
          typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
          value: MsgExecuteContract.fromPartial({
            sender: this.signerAddress,
            contract: ORCA_MARKET_USK_ATOM_CONTRACT,
            msg: toUtf8(JSON.stringify(msg_claim_liquidations(idxs)))
          })
        }
      ],
      'auto'
    );
    this.logger.info({
      claim: {
        atom: `${new Decimal(tx.events[10].attributes[2].value).div(
          DENOM_AMOUNT
        )}}`
      }
    });
  }

  async getBids(): Promise<string[]> {
    const tx = await this.cosmwasmClient.queryContractSmart(
      ORCA_MARKET_USK_ATOM_CONTRACT,
      {
        bids_by_user: {
          bidder: `${this.signerAddress}`,
          limit: 31,
          start_after: '0'
        }
      }
    );
    return tx.bids;
  }

  async getTokenBalance(denom: string): Promise<string> {
    const response = await this.axiosClient.get(
      `${LCD_ENDPOINT}/cosmos/bank/v1beta1/balances/${this.signerAddress}?pagination.limit=1000`,
      {}
    );
    for (let i of response.data.balances) {
      if (i['denom'] == denom) {
        return new Decimal(i['amount']).div(DENOM_AMOUNT).toString();
      }
    }
    // 残高が0の場合（Responseがないためnullと同義）
    return '0';
  }

  async getPairs(contract: string): Promise<number[]> {
    const pairs = await this.client.getAllBalances(contract);
    return [
      new Decimal(pairs[0].amount).div(DENOM_AMOUNT).toNumber(),
      new Decimal(pairs[1].amount).div(DENOM_AMOUNT).toNumber()
    ];
  }

  async getTokenPrice(tokenName: string): Promise<number> {
    const response = await this.axiosClient.get(
      // a,b,c...
      `https://api.coingecko.com/api/v3/simple/price?ids=${tokenName}&vs_currencies=usd`,
      {}
    );
    return response.data.cosmos['usd'];
  }

  // TODO: いつか可変にする
  async getAtomToAnyPriceImpact(
    token_a: number,
    token_b: number,
    tokenBalance: number
  ): Promise<number> {
    const constantProduct = new Decimal(token_a).mul(token_b);
    const token_a_swapped = new Decimal(token_a).plus(
      new Decimal(tokenBalance).mul(await this.getTokenPrice('cosmos'))
    );
    const token_b_swapped = new Decimal(constantProduct).div(token_a_swapped);
    return new Decimal(token_b_swapped)
      .minus(token_b)
      .div(token_b)
      .mul(100)
      .toNumber();
  }
}

export async function botClientFactory(): Promise<Bot> {
  const signer = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
    prefix: 'kujira'
  });
  const [{ address: signerAddress }] = await signer.getAccounts();

  const client = await SigningStargateClient.connectWithSigner(
    RPC_ENDPOINT,
    signer,
    {
      registry: registry,
      gasPrice: GasPrice.fromString('0.00125ukuji')
    }
  );

  const cosmwasmClient = await CosmWasmClient.connect(RPC_ENDPOINT);

  return new Bot(signer, client, cosmwasmClient, signerAddress);
}
