import { bancoPostgrest } from "../_shared/banco.ts";
import { whatsappZapi } from "../_shared/whatsapp.ts";
import { criarWebhookWhatsApp } from "./app.ts";
import { monitorDoAmbiente } from "../_shared/monitor.ts";

monitorDoAmbiente("webhook-whatsapp");

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const app = criarWebhookWhatsApp({
  banco: bancoPostgrest(exigir("SUPABASE_URL"), exigir("SUPABASE_SERVICE_ROLE_KEY")),
  whatsapp: whatsappZapi({ instancia: exigir("ZAPI_INSTANCIA"), token: exigir("ZAPI_TOKEN"), clientToken: exigir("ZAPI_CLIENT_TOKEN") }),
  pepper: exigir("OTP_PEPPER"),
  segredo: exigir("WEBHOOK_WHATSAPP_SEGREDO"),
});

Deno.serve(app.fetch);
