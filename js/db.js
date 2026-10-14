// 購物戰士 — IndexedDB 資料保存（規格書 §11）
// 商品文件內含 prices 與 purchases；圖片以 Blob 獨立存放於 images。

const DB_NAME = 'shopping-warrior';
const DB_VERSION = 1;
const SETTINGS_KEY = 'main';

let dbp = null;
let onError = () => {};
export const setErrorHandler = fn => { onError = fn; };

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('coupons')) db.createObjectStore('coupons', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}

const done = tx => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});
const reqP = req => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function write(storeName, fn) {
  try {
    const db = await open();
    const tx = db.transaction(storeName, 'readwrite');
    fn(tx.objectStore(storeName));
    await done(tx);
  } catch (err) {
    console.error('[db] 寫入失敗', storeName, err);
    onError(err);
  }
}

/* ---------- 序列化：Date ↔ 毫秒數；執行期欄位（img 網址）不存 ---------- */
const t = d => (d instanceof Date ? d.getTime() : d);
const d = n => new Date(n);

const itemToDoc = it => ({
  id: it.id, name: it.name, note: it.note || '', status: it.status, proxy: !!it.proxy,
  imageId: it.imageId || null, updated: t(it.updated),
  prices: it.prices.map(p => ({ ...p, at: t(p.at) })),
  purchases: it.purchases.map(pu => ({ ...pu, at: t(pu.at) })),
});
const docToItem = doc => ({
  ...doc, proxy: !!doc.proxy, updated: d(doc.updated), img: null,
  prices: doc.prices.map(p => ({ ...p, at: d(p.at) })),
  purchases: doc.purchases.map(pu => ({ ...pu, at: d(pu.at) })),
});
const couponToDoc = c => ({ id: c.id, store: c.store, note: c.note || '', imageId: c.imageId, created: t(c.created) });
const docToCoupon = doc => ({ ...doc, created: d(doc.created), img: null });

/* ---------- 讀取 ---------- */
export async function loadAll() {
  const db = await open();
  const tx = db.transaction(['items', 'coupons', 'images', 'settings'], 'readonly');
  const [itemDocs, couponDocs, images, settings] = await Promise.all([
    reqP(tx.objectStore('items').getAll()),
    reqP(tx.objectStore('coupons').getAll()),
    reqP(tx.objectStore('images').getAll()),
    reqP(tx.objectStore('settings').get(SETTINGS_KEY)),
  ]);
  const items = itemDocs.map(docToItem);
  const coupons = couponDocs.map(docToCoupon).sort((a, b) => b.created - a.created);
  const blobs = new Map(images.map(im => [im.id, im.blob]));
  const urlOf = id => (id && blobs.has(id) ? URL.createObjectURL(blobs.get(id)) : null);
  items.forEach(it => { it.img = urlOf(it.imageId); });
  coupons.forEach(c => { c.img = urlOf(c.imageId); });

  // 清除沒有被任何商品或優惠券使用的圖片（例如換過照片、已刪除的商品）
  const used = new Set([...items.map(i => i.imageId), ...coupons.map(c => c.imageId)].filter(Boolean));
  const orphans = images.map(im => im.id).filter(id => !used.has(id));
  if (orphans.length) write('images', s => orphans.forEach(id => s.delete(id)));

  return { items, coupons, settings: settings || null };
}

/* ---------- 寫入（呼叫後不需等待；失敗時觸發 onError） ---------- */
export const saveItem = it => write('items', s => s.put(itemToDoc(it)));
export const removeItem = it => write('items', s => s.delete(it.id));
export const saveCoupon = c => write('coupons', s => s.put(couponToDoc(c)));
export const removeCoupon = c => write('coupons', s => s.delete(c.id));
export const saveImage = (id, blob) => write('images', s => s.put({ id, blob }));
export const saveSettings = ({ currency, rates, ratesUpdated, autoRates, budget, powerCur, lastBackupAt }) => write('settings', s => s.put({ id: SETTINGS_KEY, currency, rates, ratesUpdated: ratesUpdated || null, autoRates: autoRates !== false, budget: budget || null, powerCur: powerCur || 'TWD', lastBackupAt: lastBackupAt || null }));

/* ---------- 備份／還原 ---------- */
const STORES = ['items', 'coupons', 'images', 'settings'];

// 讀出資料庫原始文件（備份用）
export async function exportRaw() {
  const db = await open();
  const tx = db.transaction(STORES, 'readonly');
  const [items, coupons, images, settings] = await Promise.all([
    reqP(tx.objectStore('items').getAll()),
    reqP(tx.objectStore('coupons').getAll()),
    reqP(tx.objectStore('images').getAll()),
    reqP(tx.objectStore('settings').get(SETTINGS_KEY)),
  ]);
  return { items, coupons, images, settings: settings || null };
}

// 以備份內容取代全部資料；在同一個交易中完成，任何一步失敗都會整個取消，原本的資料保持不變
export async function replaceAll({ items, coupons, images, settings }) {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  items.forEach(doc => tx.objectStore('items').put(doc));
  coupons.forEach(doc => tx.objectStore('coupons').put(doc));
  images.forEach(im => tx.objectStore('images').put(im));
  if (settings) tx.objectStore('settings').put({ ...settings, id: SETTINGS_KEY });
  await done(tx);
}
