import { ATOM_DENOM, USK_DENOM, PREMIUM } from './config';
import './liquidation_bot';
import { botClientFactory } from './liquidation_bot';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const bot = botClientFactory();
bot.then(function (b) {
  while (true) {
    (async () => {
      // Bidの確認
      const bids = await b.getBids(false);
      if (bids.length > 0) {
        return;
        // Bidが存在していないなら新たに発行
      } else {
        // USKの残高を取得してBid
        const uskBalance = await b.getTokenBalance(USK_DENOM);
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

      await delay(60 * 1000);
    })();
  }
});
