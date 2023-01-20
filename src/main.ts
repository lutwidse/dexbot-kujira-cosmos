import {
  ATOM_DENOM,
  USK_DENOM,
  BID_PREMIUM_THRESHOLD,
  BID_MAX,
  BID_MIN_USK,
  RATELIMIT_SEC,
  FIN_ATOM_USK_CONTRACT,
  BOW_ATOM_USK_CONTRACT
} from './config';
import './kujira_bot';
import { botClientFactory } from './kujira_bot';
import Decimal from 'decimal.js';

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
        if (uskBalance > BID_MIN_USK) {
          const premiumWithPriceImpact = await b.getPremiumWithPriceImpact(
            BOW_ATOM_USK_CONTRACT,
            uskBalance
          );
          await b.submitBid(premiumWithPriceImpact, uskBalance);
        }
        // TODO: プライスインパクトの確認から入札を自動でキャンセルできるようにする
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
        const priceImpact = await b.getPriceImpact(
          pairs[0],
          pairs[1],
          atomBalance,
          'cosmos'
        );
        // プライスインパクトがBID_PREMIUMよりも高いならスワップを継続
        // TODO: 手数料の計算
        if (priceImpact < BID_PREMIUM_THRESHOLD) {
          // 清算したATOMをUSKにスワップ
          await b.swap(atomBalance, FIN_ATOM_USK_CONTRACT, ATOM_DENOM);
        } else {
          // TODO: アラートの追加
        }
      }
      await delay(RATELIMIT_SEC * 1000);
    }
  })();
});
