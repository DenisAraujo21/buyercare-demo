// Service worker minimo, so para o Chrome/Android reconhecer o app como instalavel
// (criterio de "PWA instalavel"). Nao guarda nada em cache de proposito: o app ainda
// esta em desenvolvimento ativo e mudando toda hora, entao a gente sempre quer a
// versao mais nova direto da rede, nunca uma versao antiga presa em cache.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // no-op: deixa tudo passar direto pra rede

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