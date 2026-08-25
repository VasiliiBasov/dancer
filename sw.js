/* sw.js — Service Worker для офлайн-кеширования Dancing Cat.
 *
 * Стратегия:
 *   • cache-first для статических файлов (HTML, CSS, JS, PNG).
 *   • stale-while-revalidate для самого «тяжёлого» — MP3 (7.3 МБ).
 *     Первый запуск скачивает и кладёт в кеш, при повторном открытии
 *     мгновенно отдаёт из кеша и в фоне обновляет.
 *
 * Версия кеша увеличивается при изменениях ассетов — старый кеш
 * автоматически сбрасывается.
 */
const CACHE_VERSION = 'dancer-v10';
const CORE_ASSETS = [
    './',
    './index.html',
    './style.css',
    './js/audio.js',
    './js/notes.js',
    './js/cat.js',
    './js/game.js',
    './js/game-loop.js',
    './assets/cat.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Только same-origin: внешние запросы не трогаем.
    if (url.origin !== self.location.origin) return;

    const isSong = url.pathname.endsWith('/assets/song.mp3');
    if (isSong) {
        // stale-while-revalidate: сначала из кеша (быстро), параллельно в фоне
        // обновить. Если в кеше нет — ждём сеть.
        event.respondWith(
            caches.open(CACHE_VERSION).then(async (cache) => {
                const cached = await cache.match(req);
                const networkFetch = fetch(req).then((res) => {
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                }).catch(() => cached); // офлайн — отдаём что есть
                return cached || networkFetch;
            })
        );
        return;
    }

    // cache-first для всего остального.
    event.respondWith(
        caches.match(req).then((cached) => {
            if (cached) return cached;
            return fetch(req).then((res) => {
                if (res && res.ok && res.type === 'basic') {
                    const copy = res.clone();
                    caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
                }
                return res;
            }).catch(() => {
                // Офлайн и нет в кеше — отдаём корневой index.html (SPA-fallback).
                if (req.mode === 'navigate') return caches.match('./index.html');
                return new Response('', { status: 504, statusText: 'offline' });
            });
        })
    );
});
