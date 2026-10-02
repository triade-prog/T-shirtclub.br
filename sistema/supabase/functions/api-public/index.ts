// API pública da loja (seção 11): catálogo e sacola (F2), tentativa com código pelo
// WhatsApp (F3) e criação da reserva (F4). Pagamento, cancelamento, entrega e consulta
// chegam nas fases seguintes.

import { bancoPostgrest } from "../_shared/banco.ts";
import { turnstileCloudflare } from "../_shared/turnstile.ts";
import { mercadoPago } from "../_shared/pagamentos.ts";
import { comRegistroDeConexao, whatsappDoAmbiente } from "../_shared/whatsapp.ts";
import { criarApiPublica } from "./app.ts";
import { monitorDoAmbiente } from "../_shared/monitor.ts";

monitorDoAmbiente("api-public");

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const url = exigir("SUPABASE_URL");
const banco = bancoPostgrest(url, exigir("SUPABASE_SERVICE_ROLE_KEY"));
const app = criarApiPublica(Deno.env.get("REPASSE_SEGREDO"), {
  banco,
  pagamentos: mercadoPago({ accessToken: exigir("MP_ACCESS_TOKEN"), urlWebhook: `${url}/functions/v1/webhook-payments`, emailPix: exigir("MP_EMAIL_PIX") }),
  whatsapp: comRegistroDeConexao(
    whatsappDoAmbiente((nome) => Deno.env.get(nome)),
    banco,
  ),
  turnstile: turnstileCloudflare(exigir("TURNSTILE_SECRET")),
  pepper: exigir("OTP_PEPPER"),
  numeroLoja: exigir("LOJA_WHATSAPP"),
  urlLoja: exigir("LOJA_URL"),
  salIp: Deno.env.get("IP_SAL"),
});

Deno.serve(app.fetch);
