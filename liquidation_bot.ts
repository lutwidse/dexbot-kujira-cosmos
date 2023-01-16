import { kns, registry, } from "kujira.js";
import { GasPrice, coins} from "@cosmjs/stargate";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";

const RPC_ENDPOINT = "https://rpc-harpoon.kujira.app";
const MNEMONIC = "...";

const signer = await DirectSecp256k1HdWallet.fromMnemonic(MNEMONIC);

const client = await SigningCosmWasmClient.connectWithSigner(
  RPC_ENDPOINT,
  signer,
  {
    registry,
    gasPrice: GasPrice.fromString("0.00125ukuji"),
  }
);

const [account] = await signer.getAccounts();

// const ATOM_USK_LP = "kujira1yncutssgh2vj9scaymtteg949hwcft07c6qmgarxnaf04yesq3jsn6g2uv"
// const ATOM_USK_VAULT = "kujira1d5v9z4xzfswjh80r0ynuup68qzkr45lktje83gdxlnmnfnh4wvys3zr8pj"
const ATOM_USK = "kujira1yum4v0v5l92jkxn8xpn9mjg7wuldk784ctg424ue8gqvdp88qzlqr2qp2j"

// contractAddressが何を指すのか不明 - 暫定
const auctionClient = new kns.auctions.AuctionsClient(client, account.address, ATOM_USK)

// domainが何を指すのか不明 - 暫定
auctionClient.placeBid({"domain":"ATOM"}, "auto", "", coins(1000000, "uusk"))