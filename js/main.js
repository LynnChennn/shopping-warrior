// 購物戰士 — 啟動：先從資料庫讀回資料，再載入畫面
import { state } from './state.js';
import { loadAll } from './db.js';

async function start() {
  let loadFailed = false;
  try {
    const data = await loadAll();
    state.items.push(...data.items);
    state.coupons.push(...data.coupons);
    if (data.settings) {
      Object.assign(state.rates, data.settings.rates);
      state.settings.currency = data.settings.currency || state.settings.currency;
      state.settings.ratesUpdated = data.settings.ratesUpdated || null;
    }
  } catch (err) {
    console.error('[main] 讀取資料失敗', err);
    loadFailed = true;
  }
  const { init, toast } = await import('./ui.js');
  init();
  if (loadFailed) toast('無法讀取已儲存的資料。這次的變更可能無法保存，請確認不是在私密瀏覽模式。');
  requestPersistence();
  registerServiceWorker(toast);
}

// 要求瀏覽器長期保存資料（不保證會被同意；結果顯示在設定頁）
async function requestPersistence() {
  if (!navigator.storage?.persist) { state.persisted = null; return; }
  try {
    state.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch { state.persisted = null; }
}

// 離線快取；有新版本時提示更新
function registerServiceWorker(toast) {
  if (!('serviceWorker' in navigator)) return;
  // 第一次安裝時也會觸發 controllerchange，此時不需要重新載入；只有更新版本才重新載入
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then(reg => {
    const offerUpdate = worker => toast('有新版本可以使用', '立即更新', () => worker.postMessage('skipWaiting'), 0);
    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });
  }).catch(err => console.warn('[sw] 註冊失敗', err));
}

start();
