import { registry } from 'kujira.js';
import { GasPrice, SigningStargateClient, coins } from '@cosmjs/stargate';
import { DirectSecp256k1HdWallet, AccountData } from '@cosmjs/proto-signing';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
const { toUtf8 } = require('@cosmjs/encoding');
import { msg_submit_bid, msg_swap } from './kujira_wrapper';
import {
  RPC_ENDPOINT,
  MNEMONIC,
  DENOM_AMOUNT,
  ATOM_USK_CONTRACT,
  ATOM_DENOM,
  ORCA_MARKET_USK_ATOM_CONTRACT,
  KUJI_DENOM
} from './config';
const axios = require('axios');
import { ConversionUtils } from 'turbocommons-ts';

(async () => {
  class Bot {
    signer: DirectSecp256k1HdWallet;
    client: SigningStargateClient;
    signerAddress: Promise<readonly AccountData[]>;

    constructor(
      signer: DirectSecp256k1HdWallet,
      client: SigningStargateClient
    ) {
      this.signer = signer;
      this.client = client;
      this.signerAddress = this.signer.getAccounts();
    }

    swapAtomToUsk(atom: number) {
      client.signAndBroadcast(
        signerAddress,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: MsgExecuteContract.fromPartial({
              sender: signerAddress,
              contract: ATOM_USK_CONTRACT,
              msg: toUtf8(JSON.stringify(msg_swap())),
              funds: coins(atom * DENOM_AMOUNT, ATOM_DENOM)
            })
          }
        ],
        'auto'
      );
    }

    submitBid(premium: number, bid_amount: number) {
      client.signAndBroadcast(
        signerAddress,
        [
          {
            typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
            value: MsgExecuteContract.fromPartial({
              sender: signerAddress,
              contract: ORCA_MARKET_USK_ATOM_CONTRACT,
              msg: toUtf8(JSON.stringify(msg_submit_bid(premium))),
              funds: coins(bid_amount * DENOM_AMOUNT, KUJI_DENOM)
            })
          }
        ],
        'auto'
      );
    }

    async getClaimableBids(): Promise<string[]> {
      // 16進数でエンコード
      const payload = `A${ORCA_MARKET_USK_ATOM_CONTRACT}h{"bids_by_user":{"bidder":"${signerAddress}","limit":31,"start_after":"0"}}`;
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
      // 1文字目にゴミが降ってくるので削除
      // base64でデコード
      const bids =
        '{' +
        ConversionUtils.base64ToString(
          response.data.result.response.value
        ).slice(2);
      const bids_json = JSON.parse(bids);

      let claimable_idxs = [];
      for (let i of bids_json.bids) {
        if (parseInt(i['pending_liquidated_collateral']) > 0) {
          claimable_idxs.push(i['idx']);
        }
      }
      return claimable_idxs;
    }

    async getTokenBalance(denom: string): Promise<string> {
      const response = await axios.get(
        `https://lcd.kaiyo.kujira.setten.io/cosmos/bank/v1beta1/balances/${signerAddress}?pagination.limit=1000`,
        {}
      );
      for (let i of response.data.balances) {
        if (i['denom'] == denom) {
          return (parseInt(i['amount']) / DENOM_AMOUNT).toString();
        }
      }
    }
  }

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

  let bot = new Bot(signer, client);

  // FIN
  //bot.swapAtomToUsk(0.001)

  // ORCA
  //bot.submitBid(1, 1)

  /* 清算済み担保の確認
  bot.getClaimableBids().then(function (ret) {
    console.log(ret);
  });
  */

  /* wallet残高の確認
  bot.getTokenBalance(ATOM_DENOM).then(function (ret) {
    console.log(ret);
  });
  */

  // claimの処理は未確認なので後日追加
})();
