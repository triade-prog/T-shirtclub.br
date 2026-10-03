// Acessos da loja (0520): a loja manda cada página vista (fetch com keepalive); aqui sai o que não é
// página da loja e o que é robô, e o visitante vira um código que muda todo dia (sha256 do sal,
// do dia, do IP e do navegador). Nada pessoal chega ao banco. Responde 204 sempre que o corpo é
// válido, para o navegador não insistir; o limite por IP segura quem tentar inflar os números.

import type { Hono } from "hono";
import { aparelhoDoNavegador, caminhoDaVisita, ehRobo, origemDaVisita, visitaSchema } from "@tshirtclub/domain";
import { sha256Hex } from "../_shared/cripto.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { ipDaCliente, navegadorDaCliente } from "../_shared/repasse.ts";
import { lerCorpo } from "../_shared/validar.ts";
import { limitar, type DepsReserva } from "./reservas.ts";

const FUSO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" });

export function rotasAcessos(app: Hono, deps: DepsReserva): void {
  app.post("/v1/visita", async (c) => {
    const dados = await lerCorpo(c, visitaSchema);
    const navegador = navegadorDaCliente(c.req.raw.headers);
    const caminho = caminhoDaVisita(dados.caminho);
    if (!caminho || ehRobo(navegador)) return c.body(null, 204);
    const ip = ipDaCliente(c.req.raw.headers) ?? "sem-ip";
    await limitar(deps.banco, `visita_ip:${await sha256Hex(`${deps.salIp ?? ""}:${ip}`)}`, "10 minutes", 120);
    const hoje = FUSO.format(deps.agora?.() ?? new Date());
    const host = (() => { try { return new URL(deps.urlLoja).hostname; } catch { return null; } })();
    await chamar(deps.banco, "register_visit", {
      p_path: caminho,
      p_source: dados.origem === undefined ? null : origemDaVisita(dados.origem, host),
      p_device: aparelhoDoNavegador(navegador!),
      p_visitor: await sha256Hex(`${deps.salIp ?? ""}:${hoje}:${ip}:${navegador}`),
    });
    return c.body(null, 204);
  });
}
