const CACHE_NAME = 'dfstudio-v1';
const ASSETS = ['/','/index.html','/css/style.css','/js/app.js','/js/audio-engine.js','/js/effects.js','/js/markers.js','/js/ui.js','/icons/icon-192.png','/icons/icon-512.png'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(cached => cached || fetch(e.request)));
});