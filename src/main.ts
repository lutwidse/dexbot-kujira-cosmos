import {
  ATOM_DENOM,
  USK_DENOM,
  BID_MAX,
  BID_MIN_USK,
  RATELIMIT_DELAY,
  RATELIMIT_RETRY_DELAY,
  FIN_ATOM_USK_CONTRACT,
  BOW_ATOM_USK_CONTRACT,
  DENOM_AMOUNT
} from './config';
import './kujira_bot';
import { botClientFactory } from './kujira_bot';
import Decimal from 'decimal.js';

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RoundDecimal = Decimal.set({ precision: 5, rounding: 4 });

(async () => {
  console.log('[DO] botClientFactory');
  const bot = await botClientFactory();
  while (true) {
    try {
      // 入札の確認
      console.log('[CHECK] start');
      console.log('[GET] bids');
      const bids = await bot.getBids();
      // 入札の注文数が最大に達していないなら新規入札を発行
      console.log('[CHECK] bids length < BID_MAX');
      if (bids.length < BID_MAX) {
        console.log('[GET] uskBalance');
        const uskBalance = await bot.getTokenBalance(USK_DENOM);
        // USKの残高がBID_MIN_USKを上回るなら新規入札の発行を継続
        console.log('[CHECK] uskBalance > BID_MIN_USK');
        if (uskBalance > BID_MIN_USK) {
          console.log('[GET] premiumWithPriceImpact');
          const premiumWithPriceImpact = await bot.getPremiumWithPriceImpact({
            contract: BOW_ATOM_USK_CONTRACT,
            uskBalance: uskBalance
          });
          // premiumWithPriceImpactの確認・詳しくはgetPremiumWithPriceImpactを参照
          console.log('[CHECK] premiumWithPriceImpact !=0');
          if (premiumWithPriceImpact != 0) {
            // TODO: 他の清算者から入札の設定を取得して、PremiumとAmountを推定後にpremiumWithPriceImpactを調整する
            console.log('[DO] submitBid');
            await bot.submitBid(premiumWithPriceImpact, uskBalance);
          }
        }
      }

      console.log('[GET] pairs');
      let pairs = await bot.getPairs(BOW_ATOM_USK_CONTRACT);
      for (let i of bids) {
        const priceImpact = await bot.getPriceImpact(
          pairs[0],
          pairs[1],
          new RoundDecimal(i['amount']).div(DENOM_AMOUNT).floor().toNumber(),
          'cosmos'
        );
        // 入札のプレミアムよりpriceImpactが大きい場合は入札をキャンセル
        console.log('[CHECK] bid premium < priceImpact');
        if (i['premium_slot'] < priceImpact) {
          console.log('[DO] retractBid');
          await bot.retractBid(i['idx']);
          bids.splice(bids.indexOf(i, 0));
        }
      }

      // 清算済み入札の確認
      let bidsClaimable = [[], [], []];
      // 入札の平均プレミアム確認
      console.log('[GET] bidsClaimableIdxs & premiumAvg');
      for (let i of bids) {
        if (parseFloat(i['pending_liquidated_collateral']) > 0) {
          bidsClaimable[0].push(i['idx']);
          bidsClaimable[1].push(i['pending_liquidated_collateral']);
          bidsClaimable[2].push(i['premium_slot']);
        }
      }

      // 清算済み入札の受け取り
      console.log('[CHECK] bidsClaimable length > 0');
      if (bidsClaimable.length >= 3) {
        await bot.claimLiquidations(bidsClaimable[0]);
        console.log('[CHECK] priceImpact < premiums');
        // プライスインパクトよりも入札のプレミアが高いならスワップ
        for (let i = 0; i < bidsClaimable.length; i++) {
          // 清算済み担保のスワップ
          // プライスインパクトの確認
          console.log('[GET] pairs');
          pairs = await bot.getPairs(BOW_ATOM_USK_CONTRACT);
          console.log('[GET] priceImpact');
          const priceImpact = await bot.getPriceImpact(
            pairs[0],
            pairs[1],
            bidsClaimable[1][i],
            'cosmos'
          );
          if (priceImpact < bidsClaimable[2][i]) {
            // 清算したATOMをUSKにスワップ
            console.log('[DO] swap');
            await bot.swap(
              bidsClaimable[1][i],
              FIN_ATOM_USK_CONTRACT,
              ATOM_DENOM
            );
          } else {
            // TODO: アラートの追加
          }
        }
      }
      await delay(RATELIMIT_DELAY * 1000);
      console.log('');
    } catch (err) {
      // TODO: あまりにも酷いエラー処理 俺じゃなきゃ見逃しちゃうね
      console.log('[DO] Retry');
      console.log(err);
      console.log('');
      await delay(RATELIMIT_RETRY_DELAY * 1000);
    }
  }
})();
