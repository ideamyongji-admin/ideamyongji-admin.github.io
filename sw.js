// IDEA 라운지 예약 PWA 서비스 워커.
// 같은 출처(GitHub Pages) 정적 파일만 캐시하고, Firebase/Google 등 외부 요청은
// 절대 가로채지 않습니다 — Firestore 실시간 연결이 서비스 워커에 걸리면 깨지기 때문입니다.

const CACHE_NAME = "idea-lounge-v1";
const APP_SHELL = [
  "/reserve.html",
  "/assets/css/style.css",
  "/assets/js/main.js",
  "/assets/js/reserve.js",
  "/assets/js/firebase-init.js",
  "/assets/js/firebase-config.js",
  "/assets/img/icon-192.png",
  "/assets/img/icon-512.png",
  "/assets/img/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
