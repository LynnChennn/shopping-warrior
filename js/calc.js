// 購物戰士 — 計算與排序（純函式，不依賴畫面；規格書 §10）
import { DEC } from './config.js';

export const round = (n, c) => { const p = 10 ** DEC[c]; return Math.round(n * p) / p; };

// 自訂折數：8.5 → 0.85、85 → 0.85；超出 0 < 倍率 < 1 回傳 null
export function parseCustom(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return null;
  const r = n <= 10 ? n / 10 : n / 100;
  return (r > 0 && r < 1) ? r : null;
}

// s: { price, currency, disc: null | number | 'custom', custom, tax }；rates: { JPY: 0.215, ... }
export function compute(s, rates) {
  const price = parseFloat(String(s.price).replace(/,/g, ''));
  if (!(price > 0)) return null;
  const c = s.currency, rate = rates[c];
  let r = 1; const labels = [];
  if (s.disc === 'custom') { const cr = parseCustom(s.custom); if (cr) { r = cr; labels.push(+(cr * 100).toFixed(1) + ' 折'); } }
  else if (s.disc) { r = s.disc; labels.push(Math.round(s.disc * 10) + ' 折'); }
  const tax = c === 'JPY' ? s.tax : 0;
  const checkout = round(price * r, c);
  const net = tax ? round(checkout / (1 + tax), c) : checkout;
  const discLabel = labels[0] || '原價';
  if (tax) labels.push(tax === 0.08 ? '食品退稅 8%' : '用品退稅 10%');
  return {
    listPrice: price, currency: c, rate, discRate: r, tax, checkout, net,
    refund: round(checkout - net, c),
    twd: Math.round(net * rate),
    saveTWD: Math.round((price - net) * rate),
    label: labels.join('・') || '原價', discLabel,
    belowTaxFreeMin: tax ? (checkout / (1 + tax)) < 5000 : false,
  };
}

// 依台幣換算由低到高；同價時新的在前
export const sortedPrices = item => [...item.prices].sort((a, b) => a.twd - b.twd || b.at - a.at);
export const bestPrice = item => sortedPrices(item)[0] || null;
