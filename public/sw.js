self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Do not intercept cross-origin API requests
  if (url.origin !== self.location.origin) {
    return;
  }
  e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});
