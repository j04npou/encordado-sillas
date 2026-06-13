// Service worker cache-first con versión: la app funciona offline y carga al
// instante. Para publicar cambios, sube VERSION y el SW reemplazará la caché.
const VERSION = "v1";
const CACHE = `encordado-${VERSION}`;

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.json",
  "./js/app.js",
  "./js/state.js",
  "./js/gridCanvas.js",
  "./js/exporter.js",
  "./js/imageImporter.js",
  "./js/weaving.js",
  "./js/share.js",
  "./assets/chair.svg",
  "./assets/chair-favicon.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/pencil.svg",
  "./assets/eraser.svg",
  "./assets/square-dashed.svg",
  "./assets/arrows-alt.svg",
  "./assets/broom-wide.svg",
  "./assets/undo.svg",
  "./assets/redo.svg",
  "./assets/copy.svg",
  "./assets/scissors.svg",
  "./assets/paste.svg",
  "./assets/trash.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Las navegaciones (incluidos los enlaces con el diseño en la query) sirven
  // el shell cacheado; la query la lee la app, no afecta a la coincidencia.
  if (request.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
