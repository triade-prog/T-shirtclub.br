// API pública da loja (seção 11). Catálogo e cotação da sacola (F2); tentativas, OTP,
// reservas, pagamentos e consulta chegam nas fases seguintes.

import { bancoPostgrest } from "../_shared/banco.ts";
import { criarApiPublica } from "./app.ts";

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const app = criarApiPublica(Deno.env.get("REPASSE_SEGREDO"), {
  banco: bancoPostgrest(exigir("SUPABASE_URL"), exigir("SUPABASE_SERVICE_ROLE_KEY")),
});

Deno.serve(app.fetch);
