// Monta a API do painel a partir das dependências (reais no index.ts, falsas nos testes).

import { criarApp } from "../_shared/app.ts";
import type { AvisoLoja } from "../_shared/loja.ts";
import { exigirAdmin, rotasAuthAdmin, type DepsAuthAdmin, type VarsAdmin } from "./auth.ts";
import { rotasEstoque } from "./estoque.ts";
import { rotasCatalogoAdmin, type DepsCatalogo } from "./catalogo.ts";
import { rotasBloqueios } from "./bloqueios.ts";
import { rotasCancelamentos } from "./cancelamentos.ts";
import { rotasEntregas } from "./entregas.ts";
import { rotasPagamentosAdmin, type DepsPagamentosAdmin } from "./pagamentos.ts";
import { rotasPainel, type DepsPainel } from "./painel.ts";
import { rotasWhatsappAdmin } from "./whatsapp.ts";
import { rotasConta } from "./conta.ts";
import { rotasComercial } from "./comercial.ts";
import { rotasVipAdmin } from "./vip.ts";
import { rotasReservaManual } from "./reservas.ts";
import { rotasAcoesReserva } from "./reserva_acoes.ts";
import { rotasAcessosAdmin } from "./acessos.ts";

export type DepsAdmin = DepsAuthAdmin & DepsCatalogo & DepsPagamentosAdmin & DepsPainel & {
  /** Revalidação ao publicar; sem ela, a loja atualiza o catálogo em até 60 s. */
  loja?: AvisoLoja;
  /** Endereço da loja para o link da reserva manual (0470). */
  urlLoja?: string;
};

// Rotas que mudam o que a loja mostra: peças (com fotos, tamanhos e estoque), coleções, looks,
// blocos da página inicial, promoções e os nomes dos tamanhos.
// O cupom da lista VIP muda o texto do rodapé e do pop-up da loja
const CATALOGO = /^\/v1\/admin\/(products|collections|looks|home-blocks|promotions|settings\/tamanhos|vip\/config)(\/|$)/;

export function criarApiAdmin(segredo: string | undefined, deps: DepsAdmin) {
  const app = criarApp<VarsAdmin>("api-admin", segredo);

  app.get("/v1/health", (c) => c.json({ ok: true, servico: "api-admin" }));
  rotasAuthAdmin(app, deps);

  // Daqui para baixo, só com a sessão de dois fatores (aal2) de um administrador ativo.
  app.use("/v1/admin/*", async (c, next) => {
    if (c.req.path.includes("/v1/admin/auth/")) return await next();
    return await exigirAdmin(deps)(c, next);
  });
  app.get("/v1/admin/me", (c) => c.json({ userId: c.get("admin").userId }));
  // Gravação do catálogo que deu certo: avisa a loja para ela não esperar os 60 s do cache.
  app.use("/v1/admin/*", async (c, next) => {
    await next();
    const rota = c.req.path.replace(/^\/api-admin/, "");
    if (c.req.method !== "GET" && c.res.status < 300 && CATALOGO.test(rota)) await deps.loja?.catalogoMudou();
  });
  rotasEstoque(app, deps.banco);
  rotasCatalogoAdmin(app, deps);
  rotasBloqueios(app, deps.banco);
  rotasCancelamentos(app, deps.banco);
  rotasEntregas(app, deps.banco);
  rotasPagamentosAdmin(app, deps);
  rotasAcoesReserva(app, deps);
  rotasPainel(app, deps);
  rotasWhatsappAdmin(app, deps);
  rotasConta(app, deps);
  rotasComercial(app, deps);
  rotasVipAdmin(app, deps.banco);
  rotasAcessosAdmin(app, deps.banco);
  rotasReservaManual(app, { banco: deps.banco, urlLoja: deps.urlLoja ?? "https://tshirtclub.vercel.app", agora: deps.agora });

  return app;
}
