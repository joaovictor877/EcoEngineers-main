// Importado pelo service worker gerado pelo vite-plugin-pwa (workbox.importScripts).
// Recebe o Web Push de caixa reprovada e abre a tela de Validação de Expedição ao tocar.

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'Caixa reprovada';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || 'Divergência entre item, peso e QR Code.',
      tag: data.tag || 'validacao',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      requireInteraction: true,
      data: { url: data.url || '/tracking' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/tracking';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) { w.navigate(url); return w.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
