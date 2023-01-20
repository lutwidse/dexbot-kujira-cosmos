import {
  ATOM_DENOM,
  USK_DENOM,
  BID_PREMIUM,
  BID_MAX,
  BID_MIN_USK,
  RATELIMIT_SEC,
  FIN_ATOM_USK_CONTRACT,
  BOW_ATOM_USK_CONTRACT
} from './config';
import './liquidation_bot';
import { botClientFactory } from './liquidation_bot';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const bot = botClientFactory();
bot.then(function (b) {
  (async () => {
    while (true) {
      // 入札の確認
      const bids = await b.getBids();
      // 入札の注文数が最大に達していないなら新規入札を発行
      if (bids.length < BID_MAX) {
        const uskBalance = await b.getTokenBalance(USK_DENOM);
        // USKの残高がBID_MIN_USKを上回るなら新規入札の発行を継続
        if (parseFloat(uskBalance) > BID_MIN_USK) {
          await b.submitBid(PREMIUM, parseFloat(uskBalance));
        }
      }

      // 清算済み入札の確認
      let bidsIdxs = [];
      for (let i of bids) {
        if (parseFloat(i['pending_liquidated_collateral']) > 0) {
          bidsIdxs.push(i['idx']);
        }
      }
      if (bidsIdxs.length > 0) {
        await b.claimLiquidations(bidsIdxs);
        const atomBalance = await b.getTokenBalance(ATOM_DENOM);
        // プライスインパクトの確認
        const pairs = await b.getPairs(BOW_ATOM_USK_CONTRACT);
        const priceImpact = await b.getAtomToAnyPriceImpact(
          pairs[0],
          pairs[1],
          parseFloat(atomBalance)
        );
        // プライスインパクトがBID_PREMIUMよりも高いならスワップを継続
        // TODO: アラートの追加
        if (priceImpact < BID_PREMIUM) {
          // 清算したATOMをUSKにスワップ
          console.log(priceImpact);
          await b.swap(
            parseFloat(atomBalance),
            FIN_ATOM_USK_CONTRACT,
            ATOM_DENOM
          );
        }
      }
      await delay(RATELIMIT_SEC * 1000);
    }
  })();
});
