// Rovora Fleet Management Service Worker
const CACHE_NAME = 'rovora-dashboard-v16';
const OFFLINE_URL = '/offline';

// Assets to cache for offline use
const STATIC_ASSETS = [
  '/',
  '/offline',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icons/android-chrome-192x192.png',
  '/icons/android-chrome-512x512.png',
  '/icons/apple-touch-icon.png',
];

// Retry configuration for cold start handling
const RETRY_CONFIG = {
  maxRetries: 2,
  retryDelay: 1500,
  retryStatusCodes: [502, 503, 504],
};

// Helper: Fetch with retry for cold starts
async function fetchWithRetry(request, retries = RETRY_CONFIG.maxRetries) {
  try {
    const response = await fetch(request.clone());
    
    // If gateway error and retries remaining, wait and retry
    if (RETRY_CONFIG.retryStatusCodes.includes(response.status) && retries > 0) {
      console.log(`[SW] Got ${response.status}, retrying... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
      return fetchWithRetry(request, retries - 1);
    }
    
    return response;
  } catch (error) {
    if (retries > 0) {
      console.log(`[SW] Fetch failed, retrying... (${retries} left)`);
      await new Promise(resolve => setTimeout(resolve, RETRY_CONFIG.retryDelay));
      return fetchWithRetry(request, retries - 1);
    }
    throw error;
  }
}

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first with timeout, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests and Supabase
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.hostname.includes('supabase')) {
    return;
  }

  // For navigation requests, use retry logic to handle cold starts
  if (event.request.mode === 'navigate') {
    event.respondWith(
      Promise.race([
        fetchWithRetry(event.request).then((response) => {
          // Cache successful navigation responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        }),
        // 10 second timeout (accounts for retries) - if server is cold, serve cached version
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Network timeout')), 10000)
        )
      ]).catch(async () => {
        // Try cache first, then offline page
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return caches.match(OFFLINE_URL) || new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // For other requests, standard network-first approach
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((response) => {
          if (response) return response;
          return new Response('Offline', { status: 503 });
        });
      })
  );
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
    requireInteraction: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
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
