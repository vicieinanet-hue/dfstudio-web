var CACHE_NAME = 'dfstudio-v2';
var ASSETS = ['/','/index.html','/css/style.css','/js/app.js','/js/audio-engine.js','/manifest.json'];
self.addEventListener('install',function(e){ e.waitUntil(caches.open(CACHE_NAME).then(function(cache){return cache.addAll(ASSETS);})); self.skipWaiting(); });
self.addEventListener('activate',function(e){ e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(key){return key!==CACHE_NAME;}).map(function(key){return caches.delete(key);}));})); self.clients.claim(); });
self.addEventListener('fetch',function(e){ e.respondWith(caches.match(e.request).then(function(cached){return cached||fetch(e.request);})); });
