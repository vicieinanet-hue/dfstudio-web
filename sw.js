var CACHE='dfstudio-v5';
var ASSETS=['/','/index.html','/app.js','/manifest.json'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS)}));self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==CACHE}).map(function(x){return caches.delete(x)}))}));self.clients.claim()});
self.addEventListener('fetch',function(e){e.respondWith(caches.match(e.request).then(function(c){return c||fetch(e.request)}))});
