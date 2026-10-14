// 購物戰士 — Service Worker：離線快取
// 每次更新 App 檔案後，請把 VERSION 加 1，手機才會下載新版本。
const VERSION = 16;
const CACHE = `shopping-warrior-v${VERSION}`;

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './css/splash.css',
  './js/main.js',
  './js/state.js',
  './js/db.js',
  './js/config.js',
  './js/ui.js',
  './js/calc.js',
  './js/format.js',
  './js/icons.js',
  './js/backup.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/favicon-32.png',
  './img/splash/gou.png',
  './img/splash/g1.png',
  './img/splash/o1.png',
  './img/splash/g2.png',
  './img/splash/o2.png',
];

// 安裝：先把所有檔案存進快取，任何一個失敗就不啟用新版本
// cache: 'reload' 略過瀏覽器的 HTTP 快取，確保新版本拿到的是伺服器上的最新檔案
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
});

// 啟用：刪除舊版本快取
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('shopping-warrior-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 使用者按「立即更新」時，跳過等待直接啟用新版本
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// 讀取：同網域的檔案一律先用快取（離線可用、版本一致）；沒有才連網
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('./index.html') : undefined);
    return hit || fetch(req);
  })());
});
