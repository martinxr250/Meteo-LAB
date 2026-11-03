/* Service worker de Meteo-LAB: notificaciones push y página sin conexión.
   No cachea datos meteorológicos: un dato viejo mostrado como actual sería peligroso. */
const SHELL = "meteolab-shell-v1";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/offline.html", "/icon.svg"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request).catch(() => caches.match("/offline.html")));
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Meteo-LAB", body: e.data ? e.data.text() : "" }; }
  const title = data.title || "Meteo-LAB";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    tag: data.tag,
    renotify: true,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/alertas" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url ? e.notification.data.url : "/alertas";
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
