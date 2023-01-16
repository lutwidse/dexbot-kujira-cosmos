import { registry } from 'kujira.js';
import { GasPrice, SigningStargateClient, coins } from '@cosmjs/stargate';
import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { MsgExecuteContract } from 'cosmjs-types/cosmwasm/wasm/v1/tx';
const { toUtf8 } = require('@cosmjs/encoding');
import { msg_submit_bid, msg_swap } from './kujira_wrapper';
const axios = require('axios');
import { ConversionUtils } from 'turbocommons-ts';

const RPC_ENDPOINT = 'https://rpc.kaiyo.kujira.setten.io';
const MNEMONIC = '...';

const DENOM_AMOUNT = 1000000;

const ATOM_USK_CONTRACT =
  'kujira1yum4v0v5l92jkxn8xpn9mjg7wuldk784ctg424ue8gqvdp88qzlqr2qp2j';
const ATOM_DENOM =
  'ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2';

const ORCA_MARKET_USK_ATOM_CONTRACT =
  'kujira1q8y46xg993cqg3xjycyw2334tepey7dmnh5jk2psutrz3fc69teskctgfc';
const KUJI_DENOM =
  'factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk';

(async () => {
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

  function swapAtomToUsk(atom: number) {
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

  function submitBid(premium: number, bid_amount: number) {
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

  async function getClaimableBids(): Promise<string[]> {
    // 16進数でエンコード
    const payload =
      'A' +
      ORCA_MARKET_USK_ATOM_CONTRACT +
      'h{"bids_by_user":{"bidder":"' +
      signerAddress +
      '","limit":31,"start_after":"0"}}';
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
      ConversionUtils.base64ToString(response.data.result.response.value).slice(
        2
      );
    const bids_json = JSON.parse(bids);

    let claimable_idxs = [];
    for (let i of bids_json.bids) {
      if (parseInt(i['pending_liquidated_collateral']) > 0) {
        claimable_idxs.push(i['idx']);
      }
    }
    return claimable_idxs;
  }

  async function getTokenBalance(denom: string): Promise<string> {
    const response = await axios.get(
      'https://lcd.kaiyo.kujira.setten.io/cosmos/bank/v1beta1/balances/' +
        signerAddress +
        '?pagination.limit=1000',
      {}
    );
    for (let i of response.data.balances) {
      if (i['denom'] == denom) {
        return (parseInt(i['amount']) / DENOM_AMOUNT).toString();
      }
    }
  }

  // FIN
  //swapAtomToUsk(0.001)

  // Orca
  // ...
  //submitBid(1,1)

  // Claim
  /*
    getClaimableBids().then(function (ret) {
        console.log(ret);
    });
    */

  // claimの処理は未確認なので後日追加
  /*
  getTokenBalance(ATOM_DENOM).then(function (ret) {
    console.log(ret);
  });
  */
})();
