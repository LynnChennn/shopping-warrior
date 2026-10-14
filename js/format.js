// 購物戰士 — 格式化與 DOM 小工具
import { SYM, DEC } from './config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmtCur = (n, c) => SYM[c] + ' ' + n.toLocaleString('zh-TW', { minimumFractionDigits: DEC[c], maximumFractionDigits: DEC[c] });
export const fmtTWD = n => 'NT$ ' + Math.round(n).toLocaleString('zh-TW');
export const pad = n => String(n).padStart(2, '0');
export const fmtDate = d => `${d.getMonth() + 1}/${d.getDate()}`;
export const fmtDateTime = d => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const storeLabel = s => s ? (s.name + (s.branch ? ' ' + s.branch : '')) : '未指定店家';
// 有貼上的連結就用使用者的連結，否則用店名＋分店產生 Google 地圖搜尋連結
export const mapUrl = s => s.mapUrl || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(((s.ja || s.name) + ' ' + (s.branch || '')).trim());

// 是否為 Google 地圖連結（App 分享的短網址或網頁版網址）
export function isGoogleMapsUrl(text) {
  let u;
  try { u = new URL(String(text).trim()); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const h = u.hostname.toLowerCase();
  if (['maps.app.goo.gl', 'goo.gl', 'g.co', 'maps.google.com'].includes(h)) return h !== 'goo.gl' || u.pathname.startsWith('/maps');
  return /^(www\.)?google\.[a-z.]+$/.test(h) && u.pathname.startsWith('/maps');
}
export const primaryPrice = p => fmtCur(p.net, p.currency);
