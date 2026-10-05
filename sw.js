// Service worker do CodeLar: instalavel (PWA) + abre offline.
// Estrategia: REDE PRIMEIRO para tudo do proprio app (o app muda toda hora, entao a versao nova
// sempre ganha) e o cache serve so' de reserva quando a rede falha. Fontes e imagens sao estaticas:
// cache primeiro. Chamadas ao proxy (outra origem) nunca passam pelo cache - dados reais e
// pagamentos nao podem vir de uma copia antiga.
const CACHE = 'codelar-v1';
const BASE = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // proxy/API: sempre direto na rede
  const estatico = /\/assets\//.test(url.pathname);
  if (estatico) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
// Avisos de obra (Web Push). O push chega SEM texto - o Salesforce so' diz "ha novidade" - entao
// a mensagem e' sempre generica e nenhum dado do cliente passa pelo servico de push do navegador.
self.addEventListener('push', (e) => {
  e.waitUntil(self.registration.showNotification('CodeLar', {
    body: 'Há uma nova atualização da obra do seu imóvel.',
    tag: 'obra',
    renotify: true,
    data: { url: './' }
  }));
});

// Toque na notificacao: foca o app se ja estiver aberto, senao abre.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const cliente of lista) { if ('focus' in cliente) return cliente.focus(); }
    return self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  }));
});