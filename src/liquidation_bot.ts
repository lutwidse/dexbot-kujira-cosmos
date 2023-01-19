import { registry } from 'kujira.js';
import { GasPrice, SigningStargateClient, coins } from '@cosmjs/stargate';
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
  ATOM_USK_CONTRACT,
  ATOM_DENOM,
  ORCA_MARKET_USK_ATOM_CONTRACT,
  USK_DENOM
} from './config';
const axios = require('axios');
import { ConversionUtils } from 'turbocommons-ts';
import { Logger } from 'tslog';
import { appendFileSync } from 'fs';
import { ILogObj } from 'tslog/dist/types/interfaces';

import axiosRetry from 'axios-retry';

axiosRetry(axios, { retries: 3 });

export class Bot {
  signer: DirectSecp256k1HdWallet;
  client: SigningStargateClient;
  signerAddress: string;
  logger: Logger<any>;

  constructor(
    signer: DirectSecp256k1HdWallet,
    client: SigningStargateClient,
    signerAddress: string
  ) {
    this.signer = signer;
    this.client = client;
    this.signerAddress = signerAddress;
    this.logger = new Logger({});

    this.logger.attachTransport((logObj) => {
      appendFileSync('logs.txt', JSON.stringify(logObj) + '\n');
    });
    this.logger.settings.type = 'json';
    this.logger.settings.prettyLogTemplate =
      '{{yyyy}}-{{mm}}-{{dd}} {{hh}}:{{MM}}\t{{logLevelName}}\t[{{filePathWithLine}}\t{{name}}]';
  }

  async swapAtomToUsk(atom: number) {
    const tx = await this.client.signAndBroadcast(
      this.signerAddress,
      [
        {
          typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
          value: MsgExecuteContract.fromPartial({
            sender: this.signerAddress,
            contract: ATOM_USK_CONTRACT,
            msg: toUtf8(JSON.stringify(msg_swap())),
            funds: coins(
              new Decimal(atom).mul(DENOM_AMOUNT).toFixed(),
              ATOM_DENOM
            )
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
    this.logger.info('Swap');
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
    // TODO: ロギング追加
    //console.log(tx);
  }

  async getBids(isClaimable: boolean): Promise<string[]> {
    // 16進数でエンコード
    const payload = `A${ORCA_MARKET_USK_ATOM_CONTRACT}h{"bids_by_user":{"bidder":"${this.signerAddress}","limit":31,"start_after":"0"}}`;
    const data =
      '0a' +
      payload
        .split('')
        .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');

    const response = await axios.post('https://rpc.kaiyo.kujira.setten.io', {
      jsonrpc: '2.0',
      id: 0,
      method: 'abci_query',
      params: {
        path: '/cosmwasm.wasm.v1.Query/SmartContractState',
        data: data,
        prove: false
      }
    });
    // base64でデコード
    // 最初の2文字にゴミが降ってくるので削除
    let bids = ConversionUtils.base64ToString(
      response.data.result.response.value
    ).slice(2);
    if (bids.charAt(0) != '{') {
      bids = `{${bids}`
    }

    // BidしていないとparseできないJSONが降ってくるので対策
    if (bids == '{"bids":[]}') {
      return [];
    } else {
      const bids_json = JSON.parse(bids);

      let idxs = [];
      if (isClaimable) {
        for (let i of bids_json.bids) {
          if (parseInt(i['pending_liquidated_collateral']) > 0) {
            idxs.push(i['idx']);
          }
        }
        return idxs;
      } else {
        for (let i of bids_json.bids) {
          idxs.push(i['idx']);
        }
        return idxs;
      }
    }
  }
  async getTokenBalance(denom: string): Promise<string> {
    const response = await axios.get(
      `https://lcd.kaiyo.kujira.setten.io/cosmos/bank/v1beta1/balances/${this.signerAddress}?pagination.limit=1000`,
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
}

export async function botClientFactory() {
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

  return new Bot(signer, client, signerAddress);
}
