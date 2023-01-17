import { ATOM_DENOM } from './config';
import './liquidation_bot';
import { botClientFactory } from './liquidation_bot';

let bot = botClientFactory();

bot.then(function (b) {
  // FIN
  b.swapAtomToUsk(0.001);
  // ORCA
  b.submitBid(1, 1);

  // 清算済み担保の確認
  bot.then(function (b) {
    b.getClaimableBids().then(function (r) {
      console.log(r);
    });
  });

  // 残高の確認
  bot.then(function (b) {
    b.getTokenBalance(ATOM_DENOM).then(function (r) {
      console.log(r);
    });
  });

  // claimの処理は未確認なので後日追加
});
