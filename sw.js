// ================================================================
//   BISNU IoT — Service Worker (sw.js)
//   PWA অফলাইন সাপোর্ট
// ================================================================

const CACHE_NAME = 'bisnu-iot-v1';
const OFFLINE_URL = './index.html';

// অফলাইনে ক্যাশ করার ফাইলগুলো
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './Bisnu.png',
  './notification.mp3',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
  'https://fonts.googleapis.com/css2?family=Rajdhani:wght@300;400;500;600;700&family=Exo+2:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ================================================================
// Install Event — ক্যাশ তৈরি করো
// ================================================================
self.addEventListener('install', function(event) {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('[SW] Caching static assets');
        // বাইরের CDN ফাইলগুলো cache করার সময় error ignore করো
        return Promise.allSettled(
          STATIC_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ================================================================
// Activate Event — পুরানো cache সরাও
// ================================================================
self.addEventListener('activate', function(event) {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ================================================================
// Fetch Event — নেটওয়ার্ক-ফার্স্ট স্ট্র্যাটেজি
// Firebase ও API কলের জন্য: সবসময় নেটওয়ার্ক ব্যবহার করো
// বাকি সবের জন্য: ক্যাশ ফলব্যাক
// ================================================================
self.addEventListener('fetch', function(event) {
  const url = new URL(event.request.url);

  // Firebase, Google APIs — সবসময় নেটওয়ার্ক থেকে নাও (ক্যাশ করো না)
  const networkOnlyDomains = [
    'firebaseio.com',
    'googleapis.com',
    'gstatic.com',
    'firebase.google.com',
    'firebaseapp.com'
  ];

  if (networkOnlyDomains.some(domain => url.hostname.includes(domain))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // POST রিকোয়েস্ট ক্যাশ করো না
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-First for static assets, Network-First for others
  event.respondWith(
    caches.match(event.request)
      .then(function(cachedResponse) {
        if (cachedResponse) {
          // ব্যাকগ্রাউন্ডে আপডেট করো
          fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, response.clone()));
              }
            })
            .catch(() => {});
          return cachedResponse;
        }

        // ক্যাশে নেই — নেটওয়ার্ক থেকে নাও
        return fetch(event.request)
          .then(function(response) {
            if (!response || response.status !== 200 || response.type === 'opaque') {
              return response;
            }
            // ক্যাশে রাখো
            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseClone));
            return response;
          })
          .catch(function() {
            // অফলাইন — index.html দিয়ে ফলব্যাক করো
            if (event.request.destination === 'document') {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});

// ================================================================
// Push Notification সাপোর্ট (ভবিষ্যতের জন্য)
// ================================================================
self.addEventListener('push', function(event) {
  const options = {
    body: event.data ? event.data.text() : 'BISNU IoT বিজ্ঞপ্তি',
    icon: './Bisnu.png',
    badge: './Bisnu.png',
    vibrate: [200, 100, 200],
    tag: 'bisnu-iot-notification'
  };

  event.waitUntil(
    self.registration.showNotification('BISNU IoT', options)
  );
});
