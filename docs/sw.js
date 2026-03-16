const CACHE_NAME = 'mahjong-rule-book-v48';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    (async () => {
      try {
        // 同一オリジン（自分のサイトのリソース）の場合はブラウザのキャッシュを無視してネットワークから最新を取得
        const fetchOptions = e.request.url.startsWith(self.location.origin) ? { cache: 'no-cache' } : {};
        const res = await fetch(e.request, fetchOptions);
        
        // 最新データをキャッシュに保存
        const cache = await caches.open(CACHE_NAME);
        cache.put(e.request, res.clone());
        return res;
      } catch (err) {
        // ネットワークエラー（オフライン等）の場合はキャッシュからフォールバック
        return caches.match(e.request);
      }
    })()
  );
});
