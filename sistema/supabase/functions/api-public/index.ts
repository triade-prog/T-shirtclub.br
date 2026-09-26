// API pública da loja (seção 11): catálogo e sacola (F2), tentativa com código pelo
// WhatsApp (F3) e criação da reserva (F4). Pagamento, cancelamento, entrega e consulta
// chegam nas fases seguintes.

import { bancoPostgrest } from "../_shared/banco.ts";
import { turnstileCloudflare } from "../_shared/turnstile.ts";
import { whatsappZapi } from "../_shared/whatsapp.ts";
import { criarApiPublica } from "./app.ts";

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const app = criarApiPublica(Deno.env.get("REPASSE_SEGREDO"), {
  banco: bancoPostgrest(exigir("SUPABASE_URL"), exigir("SUPABASE_SERVICE_ROLE_KEY")),
  whatsapp: whatsappZapi({ instancia: exigir("ZAPI_INSTANCIA"), token: exigir("ZAPI_TOKEN"), clientToken: exigir("ZAPI_CLIENT_TOKEN") }),
  turnstile: turnstileCloudflare(exigir("TURNSTILE_SECRET")),
  pepper: exigir("OTP_PEPPER"),
  numeroLoja: exigir("LOJA_WHATSAPP"),
  urlLoja: exigir("LOJA_URL"),
  salIp: Deno.env.get("IP_SAL"),
});

Deno.serve(app.fetch);
