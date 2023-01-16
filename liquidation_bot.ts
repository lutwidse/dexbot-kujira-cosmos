import { registry, FinClient } from "kujira.js";
import {Coin} from "kujira.js/src/fin"
import { GasPrice, SigningStargateClient, coins } from "@cosmjs/stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
const { toUtf8 } = require("@cosmjs/encoding");
import { msg_swap } from "./kujira_wrapper"

const RPC_ENDPOINT = "https://rpc.kaiyo.kujira.setten.io";
const MNEMONIC = "...";


const ATOM_USK_CONTRACT = "kujira1yum4v0v5l92jkxn8xpn9mjg7wuldk784ctg424ue8gqvdp88qzlqr2qp2j";
const DENOM = "ibc/27394FB092D2ECCD56123C74F36E4C1F926001CEADA9CA97EA622B25F41E5EB2";
const DENOM_AMOUNT = 1000000;

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
                // 1USK $10.20 per ATOM
                msg: toUtf8(JSON.stringify(msg_swap())
                ),
                "funds": coins(atom*DENOM_AMOUNT, DENOM)
            },
            )
        }], "auto")
    }

    // Orca
    // ...

    // FIN
    swapAtomToUsk(0.001)
})();