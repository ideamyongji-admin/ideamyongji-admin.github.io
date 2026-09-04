// IDEA 라운지 예약 PWA 서비스 워커.
// 같은 출처(GitHub Pages) 정적 파일만 캐시하고, Firebase/Google 등 외부 요청은
// 절대 가로채지 않습니다 — Firestore 실시간 연결이 서비스 워커에 걸리면 깨지기 때문입니다.

const CACHE_NAME = "idea-lounge-v2";
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
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // 예약 앱 셸에 포함된 파일만 다룹니다. index.html/news.html 등 나머지 사이트
  // 페이지는 절대 가로채지 않아야, 공지사항 등 자주 바뀌는 콘텐츠가 캐시 때문에
  // 옛날 버전으로 보이는 일이 없습니다.
  if (!APP_SHELL.includes(url.pathname)) return;

  // 네트워크 우선: 온라인일 때는 항상 최신 파일을 받아오고 캐시를 갱신하며,
  // 오프라인일 때만 캐시로 대체합니다(오래된 화면이 우선 노출되지 않도록).
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
