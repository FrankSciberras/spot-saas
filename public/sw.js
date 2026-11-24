// Rovora Fleet Management Service Worker
//
// What this worker does, and on purpose does NOT do:
//
//  - Page loads (navigations): always asks the server for the current page,
//    then keeps a copy so the page still opens offline. If the server is down
//    or unreachable, the last copy is shown; failing that, /offline.
//  - A short list of app-shell files (manifest, icons) is kept for offline use.
//  - EVERYTHING ELSE goes straight to the browser, untouched: Next.js JS/CSS
//    chunks, RSC payloads (client-side navigation), images, fonts, /api, and
//    any request to another origin or scheme (chrome-extension://, analytics,
//    Supabase, map tiles, YouTube...).
//
// The previous version funnelled every request through the worker and copied
// every response into one never-pruned cache. That (a) threw on
// chrome-extension:// requests, (b) threw "Cache.put() encountered a network
// error" whenever Next.js cancelled a prefetch, (c) grew the cache with every
// deploy, and worst of all (d) let the HTTP cache's stale-while-revalidate hand
// the worker the PREVIOUS deploy's HTML. That HTML points at JS/CSS chunks the
// new deploy no longer has: the page loaded unstyled and half-broken
// (404 chunks, "MIME type text/plain") until a second reload. Hashed chunks
// are immutable and the browser's HTTP cache already keeps them for a year,
// so the worker has nothing to add there.
//
// Bump CACHE_NAME whenever this file changes how things are cached: the
// activate step deletes every other cache, which clears old copies.
const CACHE_NAME = 'rovora-dashboard-v18';
const OFFLINE_URL = '/offline';

// Pages cached at install so there is always something to show offline.
const PRECACHE_PAGES = ['/', OFFLINE_URL];

// Non-page files the worker answers for (network first, cached copy offline).
const SHELL_FILES = [
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/icons/apple-touch-icon.png',
];

// A page load that hasn't answered after this long falls back to the cached
// copy (or /offline) instead of leaving the driver staring at a blank screen.
const NAVIGATION_TIMEOUT = 10000;

// Retry configuration for cold starts (a 502/503/504 or a dropped connection
// while the container restarts after a deploy).
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1500,
  retryStatusCodes: [502, 503, 504],
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a page, always checking with the server first.
 *
 * `cache: 'no-cache'` makes the browser revalidate its HTTP-cached copy (a
 * cheap 304 when nothing changed) instead of serving it under the response's
 * `stale-while-revalidate` window, which for pages is a year. A navigate-mode
 * Request can't be cloned with a different cache mode, so it is rebuilt from
 * its URL. `redirect: 'manual'` hands redirects (e.g. signed-out -> /login)
 * back to the browser to follow, so the address bar ends up on the right URL.
 */
function fetchPage(request) {
  return fetch(request.url, {
    method: 'GET',
    headers: request.headers,
    credentials: 'include',
    redirect: 'manual',
    cache: 'no-cache',
    referrer: request.referrer,
  });
}

/**
 * Get the live page: the navigation-preload response when the browser already
 * started one (it runs in parallel with this worker waking up), otherwise a
 * fresh fetch. Gateway errors and dropped connections are retried, because
 * they usually mean the container is mid-restart.
 */
async function fetchLivePage(event) {
  for (let attempt = 0; ; attempt++) {
    const lastAttempt = attempt >= RETRY_CONFIG.maxRetries;
    try {
      const preloaded = attempt === 0 ? await event.preloadResponse : undefined;
      const response = preloaded || (await fetchPage(event.request));
      if (lastAttempt || !RETRY_CONFIG.retryStatusCodes.includes(response.status)) {
        return response;
      }
      console.log(`[SW] Got ${response.status}, retrying...`);
    } catch (error) {
      if (lastAttempt) throw error;
      console.log('[SW] Page fetch failed, retrying...');
    }
    await sleep(RETRY_CONFIG.retryDelay);
  }
}

async function offlineFallback(request) {
  return (
    (await caches.match(request)) ||
    (await caches.match(OFFLINE_URL)) ||
    new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })
  );
}

async function handleNavigation(event) {
  try {
    const response = await Promise.race([
      fetchLivePage(event),
      sleep(NAVIGATION_TIMEOUT).then(() => {
        throw new Error('Network timeout');
      }),
    ]);
    // Keep a copy for offline use. Only complete, same-origin 200s: never
    // redirects, errors or partial responses.
    if (response.status === 200 && response.type === 'basic') {
      const copy = response.clone();
      event.waitUntil(
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, copy))
          .catch(() => {}),
      );
    }
    return response;
  } catch {
    return offlineFallback(event.request);
  }
}

// Install event - cache the offline pages and app-shell files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      // 'reload' skips the HTTP cache so the copies are from this deploy.
      return cache.addAll(
        [...PRECACHE_PAGES, ...SHELL_FILES].map((url) => new Request(url, { cache: 'reload' })),
      );
    }),
  );
  self.skipWaiting();
});

// Activate event - turn on navigation preload, clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Lets the browser start the page request while this worker boots,
      // instead of waiting for it. Not supported everywhere; harmless if not.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* unsupported */
        }
      }
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// Fetch event - pages and app-shell files only; everything else is left alone
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Only our own origin. This also skips chrome-extension://, data: and every
  // third party (Supabase, analytics, map tiles...).
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // API routes and file downloads opened directly aren't pages.
    if (url.pathname.startsWith('/api/')) return;
    event.respondWith(handleNavigation(event));
    return;
  }

  if (!url.search && SHELL_FILES.includes(url.pathname)) {
    event.respondWith(
      fetch(request).catch(() =>
        caches
          .match(request)
          .then((cached) => cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } })),
      ),
    );
  }
  // Anything else: no respondWith, so the browser fetches it normally.
});

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push received');

  let data = {
    title: 'Rovora',
    body: 'You have a new notification',
    icon: '/icons/android-chrome-192x192.png',
    badge: '/icons/favicon-32x32.png',
    data: { url: '/' },
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    vibrate: [100, 50, 100],
    data: data.data,
    actions: [
      { action: 'open', title: 'View' },
      { action: 'close', title: 'Dismiss' },
    ],
    // Chat messages opt out of sticking around until dismissed.
    requireInteraction: data.requireInteraction !== false,
  };
  // A tag (e.g. one per chat) makes a newer notification replace the older
  // one instead of stacking up; renotify still buzzes for the new message.
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }

  event.waitUntil((async () => {
    // Already looking at that chat? Then the message is on screen — no popup.
    if (data.skipIfVisible && data.data && data.data.url) {
      const target = new URL(data.data.url, self.location.origin).href;
      const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((c) => c.visibilityState === 'visible' && c.url === target)) return;
    }
    await self.registration.showNotification(data.title, options);
  })());
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
