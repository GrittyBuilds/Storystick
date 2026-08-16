// Offline support. Storystick is a tool people use in basements, on job sites
// and in half-built rooms, so it has to keep working with no network at all.
//
// Strategy: precache the whole app shell on install (it is small and entirely
// static), then serve cache-first with a background refresh. Bump CACHE_VERSION
// whenever the shipped files change.

const CACHE_VERSION = 'storystick-v3';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './styles/app.css',
  './styles/fonts.css',
  './brand/tokens.css',
  './brand/logo/svg/lockup-horizontal.svg',
  './brand/logo/svg/lockup-horizontal-reverse.svg',
  './brand/icon/favicon-mark.svg',
  './brand/icon/app-icon-192.png',
  './brand/icon/app-icon-512.png',
  './brand/fonts/Inter-Regular.ttf',
  './brand/fonts/Inter-Medium.ttf',
  './brand/fonts/Inter-SemiBold.ttf',
  './brand/fonts/SpaceGrotesk-Medium.ttf',
  './brand/fonts/SpaceGrotesk-Bold.ttf',
  './brand/fonts/IBMPlexMono-Regular.ttf',
  './brand/fonts/IBMPlexMono-Medium.ttf',
  './src/main.js',
  './src/app.js',
  './src/core/units.js',
  './src/core/geometry.js',
  './src/core/entities.js',
  './src/core/document.js',
  './src/core/history.js',
  './src/core/snap.js',
  './src/core/store.js',
  './src/render/viewport.js',
  './src/render/renderer.js',
  './src/render/theme.js',
  './src/model3d/mesh.js',
  './src/model3d/build.js',
  './src/model3d/mat4.js',
  './src/model3d/viewer.js',
  './src/tools/tool.js',
  './src/tools/select.js',
  './src/tools/draw.js',
  './src/tools/build.js',
  './src/tools/index.js',
  './src/features/cutlist.js',
  './src/features/schedule.js',
  './src/features/estimate.js',
  './src/features/export.js',
  './src/features/templates.js',
  './src/ui/dom.js',
  './src/ui/dialogs.js',
  './src/ui/panels.js',
  './src/ui/toolbar.js',
  './src/ui/canvas-input.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      // Individual misses must not fail the whole install.
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations fall back to the cached shell so a cold offline start works.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit || caches.match('./')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
