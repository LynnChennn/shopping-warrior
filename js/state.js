// 購物戰士 — App 狀態（啟動時由 js/db.js 從 IndexedDB 讀回）
import { DEFAULT_RATES } from './config.js';

export const state = {
  items: [],      // 商品（含 prices、purchases）
  coupons: [],    // 優惠券
  rates: { ...DEFAULT_RATES },
  // budget：總預算（台幣），null = 未設定；powerCur：目前戰鬥力卡片的顯示幣別
  // autoRates：開啟 App 時自動更新匯率（手動修改匯率會自動關閉）
  settings: { currency: 'JPY', ratesUpdated: null, autoRates: true, budget: null, powerCur: 'TWD', lastBackupAt: null },
};
