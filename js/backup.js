// 購物戰士 — 完整備份／還原（JSON 檔，圖片以 data URL 內嵌）
// 只處理資料格式，不碰畫面；讀寫資料庫由 js/db.js 的 exportRaw()／replaceAll() 負責。

export const BACKUP_APP = 'shopping-warrior';
export const BACKUP_FORMAT = 1;

// Blob → data URL（不用 FileReader，瀏覽器與 Node 測試環境都能執行）
export async function blobToDataURL(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export function dataURLToBlob(url) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url || '');
  if (!m || !m[2]) throw new Error('bad-image');
  const bin = atob(m[3]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: m[1] || 'image/jpeg' });
}

// raw：{ items, coupons, images: [{ id, blob }], settings }（資料庫中的原始文件）
export async function buildBackup(raw, now = Date.now()) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    exportedAt: now,
    items: raw.items,
    coupons: raw.coupons,
    settings: raw.settings || null,
    images: await Promise.all(raw.images.map(async im => ({ id: im.id, data: await blobToDataURL(im.blob) }))),
  };
}

// 解析並檢查備份檔；不是本 App 的備份或內容不完整時丟出錯誤（code 為使用者可讀的原因）
export function parseBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch { throw Object.assign(new Error('not-json'), { code: 'not-backup' }); }
  if (!b || b.app !== BACKUP_APP) throw Object.assign(new Error('wrong-app'), { code: 'not-backup' });
  if (typeof b.format !== 'number' || b.format > BACKUP_FORMAT) throw Object.assign(new Error('newer-format'), { code: 'newer' });
  const ok = Array.isArray(b.items) && Array.isArray(b.coupons) && Array.isArray(b.images)
    && b.items.every(i => i && typeof i.id === 'string' && typeof i.name === 'string' && Array.isArray(i.prices) && Array.isArray(i.purchases))
    && b.coupons.every(c => c && typeof c.id === 'string' && c.store)
    && b.images.every(im => im && typeof im.id === 'string' && typeof im.data === 'string');
  if (!ok) throw Object.assign(new Error('incomplete'), { code: 'broken' });
  return b;
}

export function summarize(b) {
  return {
    exportedAt: b.exportedAt ? new Date(b.exportedAt) : null,
    items: b.items.length,
    prices: b.items.reduce((n, i) => n + i.prices.length, 0),
    purchases: b.items.reduce((n, i) => n + i.purchases.length, 0),
    coupons: b.coupons.length,
    images: b.images.length,
  };
}

// 備份 → 可寫回資料庫的原始資料（圖片轉回 Blob）
export function backupToRaw(b) {
  return {
    items: b.items,
    coupons: b.coupons,
    settings: b.settings,
    images: b.images.map(im => ({ id: im.id, blob: dataURLToBlob(im.data) })),
  };
}

export function backupFileName(now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `購物戰士備份-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}
