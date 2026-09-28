// Lista VIP (0390): a loja inscreve quem quer receber drops e ofertas pelo WhatsApp, com o
// consentimento (o texto guardado é o do domínio, o mesmo que a loja mostra). Sem Turnstile: a
// inscrição não manda mensagem nenhuma; o limite por IP e por número segura o abuso.
// 1. POST /v1/vip: inscreve (ou renova) e devolve o cupom de boas-vindas, se estiver valendo.
// 2. GET /v1/catalog/vip: o benefício do cupom, sem o código, para o texto do pop-up e do rodapé.

import type { Hono } from "hono";
import { TEXTO_CONSENTIMENTO_VIP, vipSchema, type BeneficioVip } from "@tshirtclub/domain";
import { sha256Hex } from "../_shared/cripto.ts";
import { chamar } from "../_shared/erros-banco.ts";
import { ipDaCliente } from "../_shared/repasse.ts";
import { lerCorpo } from "../_shared/validar.ts";
import { limitar, type DepsReserva } from "./reservas.ts";

export function rotasVip(app: Hono, deps: DepsReserva): void {
  app.post("/v1/vip", async (c) => {
    const dados = await lerCorpo(c, vipSchema);
    const ipHash = await sha256Hex(`${deps.salIp ?? ""}:${ipDaCliente(c.req.raw.headers) ?? "sem-ip"}`);
    await limitar(deps.banco, `vip_ip:${ipHash}`, "1 hour", 30);
    await limitar(deps.banco, `vip_tel:${await sha256Hex(dados.telefone)}`, "1 hour", 5);
    const r = await chamar<{ novo: boolean; cupom: (BeneficioVip & { codigo: string }) | null }>(deps.banco, "vip_signup", {
      p_phone: dados.telefone, p_name: dados.nome ?? null, p_source: dados.origem, p_consent_text: TEXTO_CONSENTIMENTO_VIP, p_ip_hash: ipHash,
    });
    return c.json(r, r.novo ? 201 : 200);
  });

  app.get("/v1/catalog/vip", async (c) => c.json({ beneficio: await chamar<BeneficioVip | null>(deps.banco, "vip_offer") }));
}
