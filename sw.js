// ================================================================
//  BISNU IoT — sw.js (Service Worker)
//  PWA অফলাইন সাপোর্ট ও ক্যাশিং স্ট্র্যাটেজি
// ================================================================

const CACHE_NAME = 'bisnu-iot-v1';
const RUNTIME_CACHE = 'bisnu-runtime-v1';

// ---- অফলাইনে ক্যাশ করা হবে এমন ফাইলগুলো ----
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './Bisnu.png',
  './notification.mp3',
  // ব্যাকগ্রাউন্ড ইমেজগুলো (যদি থাকে)
  './Login image.jpg',
  // Font Awesome (CDN fallback — অফলাইনে না থাকলেও চলবে)
];

// ---- CDN রিসোর্স — নেটওয়ার্ক-ফার্স্ট স্ট্র্যাটেজি ----
const CDN_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'www.gstatic.com', // Firebase SDK
];

// ================================================================
// INSTALL — প্রি-ক্যাশিং
// ================================================================
self.addEventListener('install', (event) => {
  console.log('[SW] Installing BISNU IoT Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Pre-caching app shell...');
        // প্রতিটি ফাইল আলাদাভাবে ক্যাশ করো, একটি ফেল হলে বাকিগুলো চলবে
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err => {
              console.warn(`[SW] Pre-cache skip: ${url}`, err.message);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ================================================================
// ACTIVATE — পুরানো ক্যাশ পরিষ্কার
// ================================================================
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating BISNU IoT Service Worker...');
  const validCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !validCaches.includes(key))
            .map((key) => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ================================================================
// FETCH — রিকোয়েস্ট ইন্টারসেপ্ট
// ================================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ---- Firebase / Auth রিকোয়েস্ট — সরাসরি নেটওয়ার্কে পাঠাও ----
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebase.google.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com')
  ) {
    return; // SW হস্তক্ষেপ করবে না
  }

  // ---- CDN রিসোর্স — নেটওয়ার্ক-ফার্স্ট, ক্যাশ-ফলব্যাক ----
  if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(networkFirstStrategy(request, RUNTIME_CACHE));
    return;
  }

  // ---- লোকাল অ্যাসেট — ক্যাশ-ফার্স্ট, নেটওয়ার্ক-ফলব্যাক ----
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }
});

// ================================================================
// স্ট্র্যাটেজি ফাংশন
// ================================================================

/**
 * Cache-First: ক্যাশে থাকলে সেখান থেকে, না হলে নেটওয়ার্ক থেকে নিয়ে ক্যাশ করো
 */
async function cacheFirstStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // অফলাইন ফলব্যাক — HTML রিকোয়েস্টের জন্য index.html দাও
    if (request.destination === 'document') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

/**
 * Network-First: নেটওয়ার্ক থেকে নেওয়ার চেষ্টা করো, ফেল হলে ক্যাশ থেকে দাও
 */
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

// ================================================================
// PUSH NOTIFICATION সাপোর্ট (ভবিষ্যতের জন্য প্রস্তুত)
// ================================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'BISNU IoT থেকে নতুন বার্তা',
    icon: './Bisnu.png',
    badge: './Bisnu.png',
    tag: 'bisnu-notification',
    data: { url: data.url || './' },
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'BISNU IoT', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './')
  );
});
