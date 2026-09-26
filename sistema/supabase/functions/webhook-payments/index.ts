import { bancoPostgrest } from "../_shared/banco.ts";
import { mercadoPago } from "../_shared/pagamentos.ts";
import { criarWebhookPagamentos } from "./app.ts";
import { monitorDoAmbiente } from "../_shared/monitor.ts";

monitorDoAmbiente("webhook-payments");

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const url = exigir("SUPABASE_URL");
const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;

const app = criarWebhookPagamentos({
  banco: bancoPostgrest(url, exigir("SUPABASE_SERVICE_ROLE_KEY")),
  pagamentos: mercadoPago({ accessToken: exigir("MP_ACCESS_TOKEN"), urlWebhook: `${url}/functions/v1/webhook-payments`, emailPix: exigir("MP_EMAIL_PIX") }),
  segredo: exigir("MP_WEBHOOK_SECRET"),
  processarDepois: (p) => runtime?.waitUntil(p),
});

Deno.serve(app.fetch);
