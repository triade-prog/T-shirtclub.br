// API do painel (seção 11). Login com senha e autenticador (F2.4); as demais rotas exigem
// a sessão de dois fatores.

import { authGoTrue } from "../_shared/auth-admin.ts";
import { storageSupabase } from "../_shared/armazenamento.ts";
import { bancoPostgrest } from "../_shared/banco.ts";
import { mercadoPago } from "../_shared/pagamentos.ts";
import { turnstileCloudflare } from "../_shared/turnstile.ts";
import { comRegistroDeConexao, whatsappZapi } from "../_shared/whatsapp.ts";
import { avisoLojaDesligado, avisoLojaHttp } from "../_shared/loja.ts";
import { criarApiAdmin } from "./app.ts";
import { monitorDoAmbiente } from "../_shared/monitor.ts";

monitorDoAmbiente("api-admin");

function exigir(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) throw new Error(`Falta a variável ${nome}`);
  return v;
}

const url = exigir("SUPABASE_URL");
const chaveServico = exigir("SUPABASE_SERVICE_ROLE_KEY");
const banco = bancoPostgrest(url, chaveServico);
// Revalidação ao publicar: sem as duas variáveis, a loja segue com o cache de 60 s.
const urlLoja = Deno.env.get("LOJA_URL");
const segredoRevalidar = Deno.env.get("REVALIDAR_SEGREDO");
if (!urlLoja || !segredoRevalidar) console.warn(JSON.stringify({ funcao: "api-admin", aviso: "sem LOJA_URL ou REVALIDAR_SEGREDO: a loja atualiza o catálogo em até 60 s" }));
const app = criarApiAdmin(Deno.env.get("REPASSE_SEGREDO"), {
  banco,
  armazenamento: storageSupabase(url, chaveServico),
  pagamentos: mercadoPago({ accessToken: exigir("MP_ACCESS_TOKEN"), urlWebhook: `${url}/functions/v1/webhook-payments`, emailPix: exigir("MP_EMAIL_PIX") }),
  auth: authGoTrue(url, exigir("SUPABASE_ANON_KEY")),
  turnstile: turnstileCloudflare(exigir("TURNSTILE_SECRET")),
  // O provedor de e-mail entra junto com o SMTP do projeto; até lá o aviso fica no log.
  avisarBloqueio: (_email, ate) => {
    console.warn(JSON.stringify({ funcao: "api-admin", aviso: "login do painel bloqueado", ate }));
    return Promise.resolve();
  },
  avisarSenhaTrocada: () => {
    console.warn(JSON.stringify({ funcao: "api-admin", aviso: "senha do painel trocada" }));
    return Promise.resolve();
  },
  whatsapp: comRegistroDeConexao(
    whatsappZapi({ instancia: exigir("ZAPI_INSTANCIA"), token: exigir("ZAPI_TOKEN"), clientToken: exigir("ZAPI_CLIENT_TOKEN") }),
    banco,
  ),
  loja: urlLoja && segredoRevalidar ? avisoLojaHttp({ urlLoja, segredo: segredoRevalidar }) : avisoLojaDesligado,
});

Deno.serve(app.fetch);
