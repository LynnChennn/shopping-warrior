// 購物戰士 — App 狀態（啟動時由 js/db.js 從 IndexedDB 讀回）
import { DEFAULT_RATES } from './config.js';

export const state = {
  items: [],      // 商品（含 prices、purchases）
  coupons: [],    // 優惠券
  rates: { ...DEFAULT_RATES },
  settings: { currency: 'JPY', ratesUpdated: null },
};
