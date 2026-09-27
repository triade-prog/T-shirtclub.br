// Proxy HTTP/2 com TLS na frente da loja local, para medir como na Vercel (HTTP/2, uma conexão
// só e prioridades) e não como no `next start` (HTTP/1.1, 6 conexões por origem, em que as
// pré-cargas de fonte seguram o CSS na fila).
//   node scripts/proxy-http2.mjs <porta> <destino> <certificado> <chave>
// Uso de medição apenas (scripts/lighthouse-container.sh com HTTP2=1); o certificado é local.
import http from "node:http";
import http2 from "node:http2";
import fs from "node:fs";

const [porta = "8443", destino = "http://127.0.0.1:3000", cert, key] = process.argv.slice(2);
const alvo = new URL(destino);
const SALTO = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "http2-settings"]);

const servidor = http2.createSecureServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key), allowHTTP1: true });
servidor.on("stream", (stream, cabecalhos) => {
  const repassados = {};
  for (const [k, v] of Object.entries(cabecalhos)) if (!k.startsWith(":")) repassados[k] = v;
  repassados.host = alvo.host;
  const pedido = http.request(
    { hostname: alvo.hostname, port: alvo.port, method: cabecalhos[":method"], path: cabecalhos[":path"], headers: repassados },
    (resposta) => {
      // O navegador pode cancelar o pedido (pré-carga, navegação) antes da resposta
      if (stream.destroyed || stream.closed) return resposta.resume();
      const saida = { ":status": resposta.statusCode };
      for (const [k, v] of Object.entries(resposta.headers)) if (!SALTO.has(k)) saida[k] = v;
      stream.respond(saida);
      resposta.pipe(stream);
    },
  );
  pedido.on("error", () => {
    if (stream.destroyed || stream.closed) return;
    if (!stream.headersSent) stream.respond({ ":status": 502 });
    stream.end();
  });
  stream.on("error", () => pedido.destroy());
  stream.on("close", () => pedido.destroy());
  stream.pipe(pedido);
});
servidor.listen(Number(porta), () => console.log(`HTTP/2 em https://localhost:${porta} → ${destino}`));
