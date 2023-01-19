import {
  ATOM_DENOM,
  USK_DENOM,
  PREMIUM,
  BID_MAX,
  BID_MIN_USK,
  RATELIMIT_SEC
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
      // Bidの確認
      const bids = await b.getBids(false);
      // Bidの注文数が最大に達していないなら新規新規注文を発行
      if (bids.length < BID_MAX) {
        // USKの残高を取得してBid
        const uskBalance = await b.getTokenBalance(USK_DENOM);
        // USKの残高がBID_MINを上回るなら新規注文の発行を継続
        if (parseFloat(uskBalance) > BID_MIN_USK) {
          await b.submitBid(PREMIUM, parseFloat(uskBalance));
        }

        // 清算済みBidの確認
        const bidsClaimable = await b.getBids(true);
        if (bidsClaimable.length > 0) {
          // 清算した担保の受け取り
          await b.claimLiquidations(bidsClaimable);
          // 清算したATOMをUSKにスワップ
          const atomBalance = await b.getTokenBalance(ATOM_DENOM);
          await b.swapAtomToUsk(parseFloat(atomBalance));
        }
      }
      await delay(RATELIMIT_SEC * 1000);
    }
  })();
});
