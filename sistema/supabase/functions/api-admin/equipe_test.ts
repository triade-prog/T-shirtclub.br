import { assertEquals } from "@std/assert";
import { ErroBanco } from "../_shared/banco.ts";
import { ADMIN, erro, logado } from "./teste_util.ts";

// Equipe do painel (0630): a dona adiciona alguém com senha provisória, tira o acesso, dá senha
// nova e zera o autenticador. A senha vai só para o Auth; o banco nunca a recebe.
const NOVA = "00000000-0000-4000-8000-0000000000e2";
const LAYANA = "00000000-0000-4000-8000-0000000000e3";
const LISTA = { podeGerenciar: true, pessoas: [] };
const senha = "provisoria forte 2026";

function banco(lookup: { id?: string; naEquipe: boolean } = { naEquipe: false }, dona = true) {
  return (funcao: string, args: Record<string, unknown>) => {
    if (!dona && funcao !== "admin_list_team") throw new ErroBanco("TS122", "Só a dona da conta cuida da equipe");
    switch (funcao) {
      case "admin_list_team": return { ...LISTA, podeGerenciar: dona };
      case "admin_team_lookup": return lookup;
      case "admin_team_add":
      case "admin_team_set_active":
      case "admin_team_log":
        return LISTA;
      case "admin_team_check": return { id: args.p_user, nome: "Layana" };
    }
  };
}

Deno.test("equipe: a dona adiciona alguém novo com a senha provisória (a senha não vai ao banco)", async () => {
  const m = await logado({ rpcExtra: banco() });
  const r = await m.pedir("/v1/admin/team", { nome: " Layana ", email: "Layana@2bee.net.br", senha });
  assertEquals(r.status, 201);
  assertEquals(m.chamadas.includes("equipe.criar:layana@2bee.net.br"), true);
  const add = m.rpcs.find((x) => x.funcao === "admin_team_add")!.args;
  assertEquals([add.p_admin, add.p_user, add.p_name], [ADMIN, NOVA, "Layana"]);
  assertEquals(JSON.stringify(m.rpcs).includes(senha), false);
});

Deno.test("equipe: e-mail com convite pela metade recebe a senha em vez de outro cadastro", async () => {
  const m = await logado({ rpcExtra: banco({ id: LAYANA, naEquipe: false }) });
  assertEquals((await m.pedir("/v1/admin/team", { nome: "Layana", email: "layana@2bee.net.br", senha })).status, 201);
  assertEquals(m.chamadas.filter((c) => c.startsWith("equipe.")), [`equipe.senha:${LAYANA}`]);
  assertEquals(m.rpcs.find((x) => x.funcao === "admin_team_add")!.args.p_user, LAYANA);
});

Deno.test("equipe: quem já está, senha fraca, e-mail repetido e dados errados", async () => {
  const ja = await logado({ rpcExtra: banco({ id: LAYANA, naEquipe: true }) });
  assertEquals((await erro(await ja.pedir("/v1/admin/team", { nome: "Layana", email: "layana@2bee.net.br", senha }))).codigo, "ALREADY_EXISTS");
  assertEquals(ja.chamadas.some((c) => c.startsWith("equipe.")), false);

  const m = await logado({ rpcExtra: banco() });
  assertEquals((await erro(await m.pedir("/v1/admin/team", { nome: "Bia", email: "bia@loja.com", senha: "senha 1234567890" }))).codigo, "PASSWORD_WEAK");
  assertEquals((await erro(await m.pedir("/v1/admin/team", { nome: "Bia", email: "repetida@loja.com", senha }))).codigo, "ALREADY_EXISTS");
  assertEquals((await erro(await m.pedir("/v1/admin/team", { nome: "Bia", email: "bia@loja.com", senha: "curta" }))).codigo, "VALIDATION_ERROR");
  assertEquals((await erro(await m.pedir("/v1/admin/team", { nome: "B", email: "bia@loja.com", senha }))).codigo, "VALIDATION_ERROR");
  assertEquals((await erro(await m.pedir("/v1/admin/team", { nome: "Bia", email: "bia", senha }))).codigo, "VALIDATION_ERROR");
  assertEquals(m.rpcs.some((x) => x.funcao === "admin_team_add"), false);
});

Deno.test("equipe: quem não é a dona vê a lista, mas não cria conta no Auth", async () => {
  const m = await logado({ rpcExtra: banco({ naEquipe: false }, false) });
  assertEquals((await (await m.pedir("/v1/admin/team")).json()).podeGerenciar, false);
  assertEquals((await m.pedir("/v1/admin/team", { nome: "Bia", email: "bia@loja.com", senha })).status, 403);
  assertEquals((await m.pedir(`/v1/admin/team/${LAYANA}/password`, { senha }, "PUT")).status, 403);
  assertEquals((await m.pedir(`/v1/admin/team/${LAYANA}/reset-mfa`, {})).status, 403);
  assertEquals(m.chamadas.some((c) => c.startsWith("equipe.")), false);
});

Deno.test("equipe: tirar o acesso, senha provisória nova e autenticador zerado", async () => {
  const m = await logado({ rpcExtra: banco() });
  assertEquals((await m.pedir(`/v1/admin/team/${LAYANA}/active`, { ativo: false }, "PUT")).status, 200);
  assertEquals(m.rpcs.find((x) => x.funcao === "admin_team_set_active")!.args.p_active, false);

  assertEquals((await m.pedir(`/v1/admin/team/${LAYANA}/password`, { senha }, "PUT")).status, 200);
  assertEquals((await erro(await m.pedir(`/v1/admin/team/${LAYANA}/password`, { senha: "nova 1234567890" }, "PUT"))).codigo, "PASSWORD_WEAK");
  assertEquals((await m.pedir(`/v1/admin/team/${LAYANA}/reset-mfa`, {})).status, 200);
  assertEquals(m.chamadas.filter((c) => c.startsWith("equipe.")), [`equipe.senha:${LAYANA}`, `equipe.senha:${LAYANA}`, `equipe.zerar:${LAYANA}`]);
  assertEquals(m.rpcs.filter((x) => x.funcao === "admin_team_log").map((x) => x.args.p_action),
    ["admin.equipe.senha_provisoria", "admin.equipe.autenticador_zerado"]);
  assertEquals((await m.pedir("/v1/admin/team/nao-e-id/active", { ativo: true }, "PUT")).status, 404);
});
