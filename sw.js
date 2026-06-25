const CACHE = 'dfstudio-v4';
const ASSETS = ['/', '/index.html', '/app.js', '/audio-processor.js', '/manifest.json'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys => {
        return Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    }));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});
