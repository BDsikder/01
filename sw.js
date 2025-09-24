// ### ফাইল ২: `sw.js` (সার্ভিস ওয়ার্কার - এই ফাইলটি আলাদাভাবে তৈরি করুন)

// ```javascript
// সার্ভিস ওয়ার্কার ফাইলের নাম: sw.js

const CACHE_NAME = 'bisnu-iot-cache-v1';
// যে ফাইলগুলো অফলাইনে ব্যবহারের জন্য ক্যাশ (সংরক্ষণ) করা হবে তাদের তালিকা
const urlsToCache = [
  './', // রুট ডিরেক্টরি
  'index.html',
  'Bisnu.png', // মূল লোগো
  'Bisnu_192.png', // অ্যাপ আইকন (ছোট)
  'Bisnu_512.png', // অ্যাপ আইকন (বড়)
  // আপনার ব্যবহৃত ব্যাকগ্রাউন্ড এবং অন্যান্য ছবিগুলোও এখানে যোগ করা হলো
  'mars-67522 (1).jpg',
  'ai-generated-7945689.jpg',
  'boat-1014711.jpg',
  'fog-4666170.jpg',
  'pier-7831868.jpg',
  'keyboard-7913431.jpg',
  'power-lines-1868352.jpg',
  'solar-8244680.jpg',
  'sunrise-1959227.jpg',
  'trees-407256.jpg',
  'electrical-single-line-diagram-4.jpg',
  '6005990.jpg',
  'https://i.ibb.co/5KJZ0Lm/system-architecture.jpg'
];

// ধাপ ১: সার্ভিস ওয়ার্কার 'install' ইভেন্ট
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('ক্যাশ স্টোরেজ সফলভাবে খোলা হয়েছে');
        return cache.addAll(urlsToCache);
      })
  );
});

// ধাপ ২: সার্ভিস ওয়ার্কার 'activate' ইভেন্ট
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('পুরানো ক্যাশ মুছে ফেলা হচ্ছে:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ধাপ ৩: সার্ভিস ওয়ার্কার 'fetch' ইভেন্ট
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});