import { bancoPostgrest } from "../_shared/banco.ts";
import { mercadoPago } from "../_shared/pagamentos.ts";
import { whatsappZapi } from "../_shared/whatsapp.ts";
import { criarWorker } from "./app.ts";
import { monitorDoAmbiente } from "../_shared/monitor.ts";

monitorDoAmbiente("worker");

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const app = criarWorker(Deno.env.get("WORKER_SEGREDO"), {
  banco: bancoPostgrest(exigir("SUPABASE_URL"), exigir("SUPABASE_SERVICE_ROLE_KEY")),
  whatsapp: whatsappZapi({ instancia: exigir("ZAPI_INSTANCIA"), token: exigir("ZAPI_TOKEN"), clientToken: exigir("ZAPI_CLIENT_TOKEN") }),
  pagamentos: mercadoPago({
    accessToken: exigir("MP_ACCESS_TOKEN"),
    urlWebhook: `${exigir("SUPABASE_URL")}/functions/v1/webhook-payments`,
    emailPix: exigir("MP_EMAIL_PIX"),
  }),
});

Deno.serve(app.fetch);
