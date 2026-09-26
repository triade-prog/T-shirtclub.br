import { bancoPostgrest } from "../_shared/banco.ts";
import { whatsappZapi } from "../_shared/whatsapp.ts";
import { criarWorker } from "./app.ts";

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const app = criarWorker(Deno.env.get("WORKER_SEGREDO"), {
  banco: bancoPostgrest(exigir("SUPABASE_URL"), exigir("SUPABASE_SERVICE_ROLE_KEY")),
  whatsapp: whatsappZapi({ instancia: exigir("ZAPI_INSTANCIA"), token: exigir("ZAPI_TOKEN"), clientToken: exigir("ZAPI_CLIENT_TOKEN") }),
});

Deno.serve(app.fetch);
