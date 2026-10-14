// 購物戰士 — 自動更新匯率（ExchangeRate-API 免費版，免金鑰、每日更新一次）
// 使用條款要求標示資料來源：https://www.exchangerate-api.com/terms
// 只處理資料，不碰畫面；失敗時回傳 null，由呼叫端沿用原本的匯率。

export const RATES_URL = 'https://open.er-api.com/v6/latest/TWD';
export const RATES_SOURCE = { name: 'ExchangeRate-API', url: 'https://www.exchangerate-api.com' };
export const AUTO_RATES_MIN_GAP = 60 * 60 * 1000; // 1 小時內更新過就不再抓（資料來源每天才更新一次）

// API 回傳「1 TWD = ? 外幣」，App 需要「1 外幣 = ? TWD」；保留 4 位有效數字
export function parseRates(json, curs) {
  if (!json || json.result !== 'success' || json.base_code !== 'TWD' || !json.rates) return null;
  const out = {};
  for (const c of curs) {
    const r = json.rates[c];
    if (!(typeof r === 'number' && r > 0)) return null;
    out[c] = Number((1 / r).toPrecision(4));
  }
  return out;
}

export async function fetchRates(curs, { fetchFn = fetch, timeout = 8000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetchFn(RATES_URL, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) return null;
    return parseRates(await res.json(), curs);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
