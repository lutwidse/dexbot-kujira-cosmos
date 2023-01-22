import { registry } from 'kujira.js';
import { GasPrice, SigningStargateClient, coins } from '@cosmjs/stargate';
import { CosmWasmClient } from '@cosmjs/cosmwasm-stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
const { toUtf8 } = require('@cosmjs/encoding');
import Decimal from 'decimal.js';
import {
  msg_claim_liquidations,
  msg_retract_bid,
  msg_submit_bid,
  msg_swap
} from './msg_wrapper';
import {
  RPC_ENDPOINT,
  MNEMONIC,
  DENOM_AMOUNT,
  ORCA_MARKET_USK_ATOM_CONTRACT,
  USK_DENOM,
  BID_PREMIUM_THRESHOLD
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
        return retryCount * 10 * 1000;
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
    const tx = await this.client.signAndBroadcast(
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

    await this.logger.info({
      bid: {
        usk: `${new Decimal(tx.events[13].attributes[3].value).div(
          DENOM_AMOUNT
        )}}`
      }
    });
  }

  async retractBid(idx: string) {
    const tx = await this.client.signAndBroadcast(
      this.signerAddress,
      [
        {
          typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
          value: MsgExecuteContract.fromPartial({
            sender: this.signerAddress,
            contract: ORCA_MARKET_USK_ATOM_CONTRACT,
            msg: toUtf8(JSON.stringify(msg_retract_bid(idx)))
          })
        }
      ],
      'auto'
    );
    await this.logger.info({
      retract: {
        usk: `${new Decimal(tx.events[10].attributes[3].value).div(
          DENOM_AMOUNT
        )}}`
      }
    });
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
    await this.logger.info({
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

  async getTokenBalance(denom: string): Promise<number> {
    const tx = await this.cosmwasmClient.getBalance(this.signerAddress, denom);
    const RoundDecimal = Decimal.set({ precision: 5, rounding: 4 });
    return new RoundDecimal(tx.amount).div(DENOM_AMOUNT).toNumber();
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

  async getPriceImpact(
    token_a: number,
    token_b: number,
    tokenBalance: number,
    tokenName: string
  ): Promise<number> {
    // https://dailydefi.org/articles/price-impact-and-how-to-calculate/
    // https://ethereum.stackexchange.com/questions/102063/understand-price-impact-and-liquidity-in-pancakeswap
    // TODO: スリッページの計算
    // TODO: 手数料の計算
    const constantProduct = new Decimal(token_a).mul(token_b);
    const amountIn = new Decimal(tokenBalance).mul(
      await this.getTokenPrice(tokenName)
    );
    const token_a_swapped = new Decimal(token_a).plus(amountIn);
    const token_b_swapped = new Decimal(constantProduct).div(token_a_swapped);
    const amountOut = new Decimal(token_b).minus(token_b_swapped);
    const marketPrice = new Decimal(amountIn).div(amountOut);
    const midPrice = new Decimal(token_a).div(token_b);
    const priceImpact = new Decimal(1)
      .minus(new Decimal(midPrice).div(marketPrice))
      .mul(100);
    return priceImpact.toNumber();
  }

  async getPremiumWithPriceImpact({
    contract,
    uskBalance
  }: {
    contract: string;
    uskBalance: number;
  }): Promise<number> {
    const pairs = await this.getPairs(contract);
    const priceImpact = new Decimal(
      await this.getPriceImpact(
        pairs[0],
        pairs[1],
        new Decimal(uskBalance)
          .div(await this.getTokenPrice('cosmos'))
          .toNumber(),
        'cosmos'
      )
    );
    let premiumWithPriceImpact = await new Decimal(priceImpact)
      .plus(BID_PREMIUM_THRESHOLD)
      .round()
      .toNumber();

    // 大量の清算が発生した場合にpremiumWithPriceImpactが30を超える可能性があるので確認
    if (premiumWithPriceImpact > 30) {
      if (priceImpact.toNumber() <= 30 - BID_PREMIUM_THRESHOLD) {
        premiumWithPriceImpact = 30;
      } else {
        premiumWithPriceImpact = 0;
      }
    }
    return premiumWithPriceImpact;
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
