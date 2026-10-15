"use strict";

const CACHE_NAME = "pixel-hearts-v5-production";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
];

// URLs and service hosts that must NEVER be intercepted or cached
const BYPASS_HOST_KEYWORDS = [
  "firebaseio.com",
  "googleapis.com",
  "cloudfunctions.net",
  "google-analytics.com",
  "firebase.google.com",
  "identitytoolkit"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn("[SW] Precache completed with non-fatal items:", err);
      });
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log("[SW] Evicting legacy cache:", key);
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Strictly bypass caching for Firebase, Firestore, Auth, Functions, external APIs
  if (BYPASS_HOST_KEYWORDS.some((kw) => url.hostname.includes(kw))) {
    return;
  }

  // Only handle same-origin or explicit static assets
  if (url.origin !== self.location.origin) {
    return;
  }

  // Strategy 1: HTML Navigation requests -> Network-First with Offline Cache Fallback.
  // This guarantees new Vercel deployments immediately load the fresh index.html
  // and do not link to old hashed JS chunks that no longer exist on the server.
  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
          return caches.match("./");
        })
    );
    return;
  }

  // Strategy 2: Static assets (JS chunks, CSS, images, fonts) -> Cache-First with Stale Revalidation.
  // Content-addressed /assets/ chunks are safe to serve from cache and revalidate in background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && (response.type === "basic" || response.type === "cors")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || networkFetch;
    })
  );
});
