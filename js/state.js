// 購物戰士 — App 狀態（啟動時由 js/db.js 從 IndexedDB 讀回）
import { DEFAULT_RATES } from './config.js';

export const state = {
  items: [],      // 商品（含 prices、purchases）
  coupons: [],    // 優惠券
  rates: { ...DEFAULT_RATES },
  // budget：總預算（台幣），null = 未設定；powerCur：目前戰鬥力卡片的顯示幣別
  settings: { currency: 'JPY', ratesUpdated: null, budget: null, powerCur: 'TWD' },
};
