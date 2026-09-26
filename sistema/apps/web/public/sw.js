/* global self, caches, fetch, URL, Response */
// Service worker da loja (F11.6, seção 2b): guarda só a casca do app (arquivos estáticos do
// Next e da marca) e as imagens. Preço, estoque, reserva e pagamento vêm sempre da rede.
// Nunca guarda /api, /r nem páginas (as páginas podem ter dados da cliente): sem rede, a
// navegação cai na página "sem conexão", guardada na instalação.

const VERSAO = "v1";
const CASCA = `casca-${VERSAO}`;
const IMAGENS = `imagens-${VERSAO}`;
const MAX_IMAGENS = 80;
const PRECARGA = ["/offline", "/marca/logo.webp", "/marca/icone-192.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CASCA).then((c) => c.addAll(PRECARGA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CASCA && n !== IMAGENS).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

function nuncaGuardar(url) {
  return url.pathname.startsWith("/api/") || url.pathname === "/r" || url.pathname.startsWith("/r/");
}

async function aparar(nome, maximo) {
  const cache = await caches.open(nome);
  const chaves = await cache.keys();
  await Promise.all(chaves.slice(0, Math.max(0, chaves.length - maximo)).map((k) => cache.delete(k)));
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin || nuncaGuardar(url)) return;

  // Páginas: sempre da rede; sem conexão, a página "sem conexão"
  if (pedido.mode === "navigate") {
    evento.respondWith(fetch(pedido).catch(() => caches.match("/offline").then((r) => r || Response.error())));
    return;
  }

  // Casca: arquivos com hash no nome não mudam; primeiro o cache
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/marca/")) {
    evento.respondWith(
      caches.match(pedido).then((guardada) => guardada || fetch(pedido).then((r) => {
        if (r.ok) caches.open(CASCA).then((c) => c.put(pedido, r.clone()));
        return r;
      })),
    );
    return;
  }

  // Imagens: a guardada na hora, e a da rede para a próxima vez
  if (pedido.destination === "image" || url.pathname.startsWith("/_next/image")) {
    evento.respondWith(
      caches.open(IMAGENS).then(async (cache) => {
        const guardada = await cache.match(pedido);
        const daRede = fetch(pedido).then((r) => {
          if (r.ok) cache.put(pedido, r.clone()).then(() => aparar(IMAGENS, MAX_IMAGENS));
          return r;
        });
        return guardada || daRede;
      }),
    );
  }
});
