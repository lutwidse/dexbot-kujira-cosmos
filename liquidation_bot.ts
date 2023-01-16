import { registry, } from "kujira.js";
import { GasPrice} from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
const { toUtf8 } = require("@cosmjs/encoding");
import "kujira_wrapper.js"

const RPC_ENDPOINT = "https://rpc-harpoon.kujira.app";
const MNEMONIC = "...";

const signer = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC);
const [{ address: signerAddress }] = await signer.getAccounts();

const client = await SigningCosmWasmClient.connectWithSigner(
  RPC_ENDPOINT,
  signer,
  {
    registry,
    gasPrice: GasPrice.fromString("0.00125ukuji"),
  }
);

const ATOM_USK_CONTRACT = "kujira1yum4v0v5l92jkxn8xpn9mjg7wuldk784ctg424ue8gqvdp88qzlqr2qp2j"

client.signAndBroadcast(signerAddress,[{
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
        sender: signerAddress,
        contract: ATOM_USK_CONTRACT,
        // 1USK $10.20 per ATOM
        msg: toUtf8(JSON.stringify(msg_submit_order("1","10.20"))
        ),
    },
    )
}], "auto")

/*
ここで何かしらの処理をしてorder_idxsを取得する
submit_orderの返り値からも取得できるが、他にも便利な方法があるかもしれないのでひとまず空にしておく
*/

client.signAndBroadcast(signerAddress,[{
    typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
    value: MsgExecuteContract.fromPartial({
        sender: signerAddress,
        contract: ATOM_USK_CONTRACT,
        msg: toUtf8(JSON.stringify(msg_withdraw_order(["12345","67890"]))
        ),
    },
    )
}], "auto")