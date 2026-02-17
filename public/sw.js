// Service Worker for Aragón Hábitos PWA
// This file will be wrapped and enhanced by next-pwa

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      console.log("Service Worker registration failed");
    });
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Fetch event handler for caching
self.addEventListener("fetch", (event) => {
  // Only handle GET requests
  if (event.request.method !== "GET") return;

  // Skip for chrome extensions and other non-http(s) requests
  if (!event.request.url.startsWith("http")) return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).then((response) => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === "error") {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();
          caches.open("v1").then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
      );
    })
  );
});
