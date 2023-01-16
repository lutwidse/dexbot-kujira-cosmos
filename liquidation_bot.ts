import { registry } from "kujira.js";
import { GasPrice, SigningStargateClient, coins } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
const { toUtf8 } = require("@cosmjs/encoding");
import { msg_submit_bid, msg_swap } from "./kujira_wrapper"
const axios = require('axios');
import { ConversionUtils } from 'turbocommons-ts';

const RPC_ENDPOINT = "https://rpc.kaiyo.kujira.setten.io";
const MNEMONIC = "...";

const DENOM_AMOUNT = 1000000;

const ATOM_USK_CONTRACT = "kujira1yum4v0v5l92jkxn8xpn9mjg7wuldk784ctg424ue8gqvdp88qzlqr2qp2j";
const ATOM_DENOM = "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";

const ORCA_CONTRACT = "kujira1q8y46xg993cqg3xjycyw2334tepey7dmnh5jk2psutrz3fc69teskctgfc";
const KUJI_DENOM = "factory/kujira1qk00h5atutpsv900x202pxx42npjr9thg58dnqpa72f2p7m2luase444a7/uusk";

(async () => {

    const signer = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC, {
        prefix: "kujira",
    });
    const [{ address: signerAddress }] = await signer.getAccounts();
    
    const client = await SigningStargateClient.connectWithSigner(
        RPC_ENDPOINT,
        signer,
        {
            registry: registry,
            gasPrice: GasPrice.fromString("0.00125ukuji"),
        }
    );

    function swapAtomToUsk(atom) {
        client.signAndBroadcast(signerAddress,[{
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: MsgExecuteContract.fromPartial({
                sender: signerAddress,
                contract: ATOM_USK_CONTRACT,
                msg: toUtf8(JSON.stringify(msg_swap())
                ),
                "funds": coins(atom*DENOM_AMOUNT, ATOM_DENOM)
            },
            )
        }], "auto")
    }

    function submitBid(premium, bid_amount) {
        client.signAndBroadcast(signerAddress,[{
            typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
            value: MsgExecuteContract.fromPartial({
                sender: signerAddress,
                contract: ORCA_CONTRACT,
                msg: toUtf8(JSON.stringify(msg_submit_bid(premium))
                ),
                "funds": coins(bid_amount*DENOM_AMOUNT, KUJI_DENOM)
            },
            )
        }], "auto")
    }

    async function getClaimableBids() : Promise<string[]> {
        // 変換に差分が生まれてしまうので仕方なくハードコーディング
        // https://superdev.org/encode-base16/
        // https://superdev.org/decode-base16/
        /*const data = "0a" + ("A" + signerAddress + "h{'bids_by_user':{'bidder':" + signerAddress + ",'limit':31,'start_after':'0'}}").split("")
            .map(c => c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join("")
        */
        
        // アドレスごとに変わる
        // 調べ方はDMで聞いてください
        const data = "0a416b756a697261317138793436786739393363716733786a7963797732333334746570657937646d6e68356a6b3270737574727a33666336397465736b637467666312687b22626964735f62795f75736572223a7b22626964646572223a226b756a69726131706a346c3936373734793966683039777366337477736535357366786a726335717874387273222c226c696d6974223a33312c2273746172745f6166746572223a2230227d7d"
        
        const bids = axios.post("https://rpc.kaiyo.kujira.setten.io", {
            'jsonrpc': '2.0',
            'id': 0,
            'method': 'abci_query',
            'params': {
                'path': '/cosmwasm.wasm.v1.Query/SmartContractState',
                'data': data,
                'prove': false
            }
        }).then(function (response) {
            
            // 1文字目にゴミが降ってくるので削除
            const bids = "{" + ConversionUtils.base64ToString(response.data.result.response.value).slice(2)
            const bids_json = JSON.parse(bids)

            var claimable_idxs = []
            for(let i of bids_json.bids){
                if (parseInt(i["pending_liquidated_collateral"]) == 0) {
                    claimable_idxs.push(i["idx"])
                }
            }
            return claimable_idxs
        })
        return bids
    }

    async function getTokenBalance(denom) : Promise<string> {
        const balances = axios.get('https://lcd.kaiyo.kujira.setten.io/cosmos/bank/v1beta1/balances/kujira1pj4l96774y9fh09wsf3twse55sfxjrc5qxt8rs?pagination.limit=1000', {

        }).then(function (response) {
            for(let i of response.data.balances){
                if (i["denom"] == denom) {
                    return (parseInt(i["amount"]) / DENOM_AMOUNT).toString()
                }
            }
        })
        return balances
    }

    // FIN
    //swapAtomToUsk(0.001)

    // Orca
    // ...
    //submitBid(1,1)

    // Claim
    /*getClaimableBids().then(function (ret) {
        console.log(ret)
    })*/

    // claimの処理は未確認なので後日追加

    /*getTokenBalance(ATOM_DENOM).then(function (ret) {
        console.log(ret)
    })*/
})();