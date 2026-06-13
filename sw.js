// Service worker cache-first con versión: la app funciona offline y carga al
// instante. Para publicar cambios, sube VERSION y el SW reemplazará la caché.
const VERSION = "v2";
const CACHE = `encordado-${VERSION}`;

// En desarrollo local no interceptamos las peticiones: así los cambios se ven
// al recargar sin tener que limpiar la caché ni subir la versión.
const DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "";

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
  "./assets/brand/chair.svg",
  "./assets/brand/chair-favicon.svg",
  "./assets/brand/icon-192.png",
  "./assets/brand/icon-512.png",
  "./assets/icons/pencil.svg",
  "./assets/icons/eraser.svg",
  "./assets/icons/square-dashed.svg",
  "./assets/icons/arrows-alt.svg",
  "./assets/icons/broom-wide.svg",
  "./assets/icons/undo.svg",
  "./assets/icons/redo.svg",
  "./assets/icons/copy.svg",
  "./assets/icons/scissors.svg",
  "./assets/icons/paste.svg",
  "./assets/icons/trash.svg",
  "./assets/icons/hand.svg",
  "./assets/icons/image.svg",
  "./assets/icons/link.svg",
  "./assets/icons/alien-8bit.svg",
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
  if (DEV || request.method !== "GET") return;

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
