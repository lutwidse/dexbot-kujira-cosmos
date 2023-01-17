import { ATOM_DENOM, USK_DENOM, PREMIUM } from './config';
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
      await b.getBids(false).then((r) => {
        // Bidが既に存在するなら何もしない
        if (r.length > 0) {
          return;
          // Bidが存在していないなら新たに発行
        } else {
          // USKの残高を取得してBid
          b.getTokenBalance(USK_DENOM).then((r) => {
            b.submitBid(PREMIUM, parseInt(r));
          });
        }
      });

      // 清算済みBidの確認
      await b.getBids(true).then((r) => {
        // Bidが存在するなら受取
        if (r.length > 0) {
          // claimの処理は未確認なので後日追加
          // ...

          // 清算したATOMをUSKにスワップ
          b.getTokenBalance(ATOM_DENOM).then((r) => {
            b.swapAtomToUsk(parseInt(r));
          });
        }
      });
      await delay(60 * 1000);
    }
  })();
});
