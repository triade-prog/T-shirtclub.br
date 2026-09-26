/* global __ENV, __VU, __ITER */
// Carga do lançamento no ambiente de teste (F11.1), com k6: 100 clientes navegando, montando
// a sacola e criando a tentativa de reserva, com as metas de resposta. O fluxo inteiro (com o
// código pelo WhatsApp, a reserva e o PIX) roda no teste de integração carga_test.ts, com os
// provedores falsos: aqui não dá para simular a cliente mandando mensagem pelo WhatsApp.
//
// Uso (nunca contra produção):
//   k6 run -e BASE=https://teste.tshirtclub.pt -e PRODUTO_ID=<uuid publicado> tests/carga/k6-lancamento.js
// O ambiente de teste usa a chave secreta de teste do Turnstile, que aceita o token abaixo.

import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE;
const PRODUTO = __ENV.PRODUTO_ID;
const TOKEN = __ENV.TURNSTILE_TOKEN || "XXXX.DUMMY.TOKEN.XXXX";

export const options = {
  scenarios: {
    lancamento: {
      executor: "ramping-vus",
      stages: [
        { duration: "1m", target: 100 },
        { duration: "3m", target: 100 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{etapa:catalogo}": ["p(95)<800"],
    "http_req_duration{etapa:sacola}": ["p(95)<800"],
    "http_req_duration{etapa:tentativa}": ["p(95)<1500"],
    checks: ["rate>0.99"],
  },
};

const json = { headers: { "content-type": "application/json", origin: BASE } };

export default function () {
  const home = http.get(`${BASE}/api/v1/catalog/home`, { tags: { etapa: "catalogo" } });
  check(home, { "página inicial": (r) => r.status === 200 });
  const produtos = http.get(`${BASE}/api/v1/catalog/products`, { tags: { etapa: "catalogo" } });
  check(produtos, { "produtos": (r) => r.status === 200 });
  sleep(1 + Math.random() * 2);

  const itens = [{ produtoId: PRODUTO, qtd: 1 }];
  const cotacao = http.post(`${BASE}/api/v1/cart/quote`, JSON.stringify({ itens }), { ...json, tags: { etapa: "sacola" } });
  check(cotacao, { "sacola cotada": (r) => r.status === 200 });
  sleep(2 + Math.random() * 3);

  // Um em cada cinco segue para "Seus dados" (a tentativa não manda mensagem: W3)
  if (Math.random() < 0.2 && cotacao.status === 200) {
    const numero = String(10000000 + ((__VU * 1000 + __ITER) % 90000000)).slice(-8);
    const t = http.post(`${BASE}/api/v1/reservation-attempts`, JSON.stringify({
      nome: "Cliente Carga", telefone: `(77) 9${numero.slice(0, 4)}-${numero.slice(4)}`, entrega: "RETIRADA", itens,
      totalEsperadoCentavos: cotacao.json("totalCentavos"), turnstileToken: TOKEN,
    }), { ...json, tags: { etapa: "tentativa" } });
    check(t, { "tentativa criada": (r) => r.status === 201 || r.status === 429 });
  }
  sleep(1);
}
