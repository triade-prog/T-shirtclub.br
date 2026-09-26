import { assert, assertEquals, assertMatch } from "@std/assert";
import { ADMIN, erro, logado } from "./teste_util.ts";

const RESERVA = "7a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d";

Deno.test("painel: dashboard, busca, detalhe e auditoria", async () => {
  const { pedir, rpcs } = await logado({
    rpcExtra: (f, args) => ({
      admin_dashboard: { reservas: { ativas: 12 }, acoes: { cancelamentosPendentes: 2 }, fila: { pendentes: 0 } },
      admin_search_reservations: { itens: [{ numero: 1048 }], pagina: 1, porPagina: 20, total: 1 },
      admin_reservation_detail: args.p_id === RESERVA ? { id: RESERVA, transicoes: [{ evento: "T1" }] } : null,
      admin_list_audit: { itens: [], pagina: 1, porPagina: 50, total: 0 },
    } as Record<string, unknown>)[f],
  });
  const painel = await (await pedir("/v1/admin/dashboard")).json();
  assertEquals([painel.reservas.ativas, painel.whatsapp.conectado], [12, true]);

  assertEquals((await (await pedir("/v1/admin/reservations?status=RESERVADO&q=%20Marina%20&page=2")).json()).total, 1);
  assertEquals(rpcs.find((r) => r.funcao === "admin_search_reservations")!.args, { p_status: "RESERVADO", p_q: "Marina", p_page: 2 });
  assertEquals((await pedir("/v1/admin/reservations?status=CANCELADO")).status, 400);

  assertEquals((await (await pedir(`/v1/admin/reservations/${RESERVA}`)).json()).transicoes[0].evento, "T1");
  assertEquals((await pedir("/v1/admin/reservations/1048")).status, 404);
  assertEquals((await pedir("/v1/admin/reservations/6f1c2d3e-4b5a-4c6d-8e7f-000000000009")).status, 404);

  assertEquals((await pedir("/v1/admin/audit?autor=ADMIN&assunto=PAGAMENTO&periodo=HOJE&pagina=3")).status, 200);
  const auditoria = rpcs.find((r) => r.funcao === "admin_list_audit")!.args;
  assertEquals([auditoria.p_actor, auditoria.p_subject, auditoria.p_page], ["ADMIN", "PAGAMENTO", 3]);
  assertMatch(String(auditoria.p_since), /T03:00:00\.000Z$/, "hoje começa à meia-noite da loja (UTC-3)");
  assertEquals((await pedir("/v1/admin/audit?assunto=QUALQUER")).status, 400);
});

Deno.test("WhatsApp no painel: conexão, QR, ritmo, notificações e mensagem de teste", async () => {
  let desligadas = ["cancelamento_recebido"];
  const { pedir, rpcs, whatsapp } = await logado({
    rpcExtra: (f, args) => {
      if (f === "admin_whatsapp_settings") return { modoLancamento: false, desligadas, fila: { pendentes: 3 } };
      if (f === "admin_update_whatsapp_settings") {
        const p = args.p as { desligadas?: string[] };
        if (p.desligadas) desligadas = p.desligadas;
        return { modoLancamento: true, desligadas, fila: { pendentes: 3 } };
      }
      if (f === "admin_whatsapp_test") return "m1";
      return undefined;
    },
  });
  const tela = await (await pedir("/v1/admin/whatsapp")).json();
  assertEquals(tela.conectado, true);
  assertEquals(tela.notificacoes.find((n: { id: string }) => n.id === "cancelamento_recebido").ligada, false);
  assertEquals(tela.notificacoes.find((n: { id: string }) => n.id === "codigo"), {
    id: "codigo", nome: "Código de verificação", quando: "Quando a cliente pede o código pelo WhatsApp", essencial: true, ligada: true,
  });
  assert(!("desligadas" in tela), "a tela vê as linhas, não os modelos");

  assertEquals(await (await pedir("/v1/admin/whatsapp/qr")).json(), { conectado: true });
  whatsapp.online = false;
  assertMatch((await (await pedir("/v1/admin/whatsapp/qr")).json()).qrCode, /^data:image\/png;base64,/);
  whatsapp.online = true;

  const salvo = await pedir("/v1/admin/settings/whatsapp", {
    modoLancamento: true, notificacoes: { cancelamento_recebido: true, cancelamento_decisao: false },
  }, "PUT");
  assertEquals(salvo.status, 200);
  const p = rpcs.findLast((r) => r.funcao === "admin_update_whatsapp_settings")!.args;
  assertEquals(p.p_admin, ADMIN);
  assertEquals((p.p as { desligadas: string[] }).desligadas.sort(), ["cancelamento_aprovado", "cancelamento_recusado"]);
  assertEquals((await pedir("/v1/admin/settings/whatsapp", { notificacoes: { codigo: false } }, "PUT")).status, 400, "essencial não desliga");
  assertEquals((await pedir("/v1/admin/settings/whatsapp", { notificacoes: { inventada: false } }, "PUT")).status, 400);
  assertEquals((await pedir("/v1/admin/settings/whatsapp", { ritmo: { intervaloMinS: 5, intervaloMaxS: 5, tetoHora: 120 } }, "PUT")).status, 400);

  const teste = await pedir("/v1/admin/whatsapp/test", { telefone: "(77) 99815-5772" });
  assertEquals(teste.status, 202);
  assertEquals(rpcs.find((r) => r.funcao === "admin_whatsapp_test")!.args, { p_admin: ADMIN, p_phone: "+5577998155772" });
});

Deno.test("Minha conta: dados, troca de senha e aparelhos", async () => {
  const { pedir, rpcs, chamadas, avisos, auditoria } = await logado({
    rpcExtra: (f) => ({
      admin_name: "Carol",
      admin_list_sessions: [{ id: "s-atual", atual: true }, { id: "s-2", atual: false }],
    } as Record<string, unknown>)[f],
  });
  const conta = await (await pedir("/v1/admin/account")).json();
  assertEquals([conta.email, conta.nome, conta.autenticadores.length, conta.aparelhos.length], ["loja@tshirtclub.pt", "Carol", 1, 2]);
  assertEquals(rpcs.find((r) => r.funcao === "admin_list_sessions")!.args, { p_admin: ADMIN, p_current: "s-atual" });

  assertEquals((await erro(await pedir("/v1/admin/account/password", { atual: "outra senha qualquer", nova: "uma frase nova e longa" }, "PUT"))).codigo,
    "INVALID_CREDENTIALS");
  assert(auditoria.includes("admin.senha.atual_errada"));
  assertEquals((await pedir("/v1/admin/account/password", { atual: "senha certa 123", nova: "curta" }, "PUT")).status, 400);
  assertEquals((await pedir("/v1/admin/account/password", { atual: "senha certa 123", nova: "senha certa 123" }, "PUT")).status, 400, "a nova não pode ser a atual");
  assertEquals((await erro(await pedir("/v1/admin/account/password", { atual: "senha certa 123", nova: "123456789012" }, "PUT"))).codigo, "PASSWORD_WEAK");
  assert(!chamadas.includes("auth.sairDosOutros"), "senha fraca não derruba ninguém");

  assertEquals((await pedir("/v1/admin/account/password", { atual: "senha certa 123", nova: "uma frase nova e longa" }, "PUT")).status, 200);
  assert(chamadas.includes("auth.sairDosOutros"), "os outros aparelhos saem");
  assert(avisos.includes("senha:loja@tshirtclub.pt"), "aviso por e-mail");
  assert(auditoria.includes("admin.senha.trocada"));

  assertEquals((await pedir("/v1/admin/account/sessions/revoke-others", {})).status, 200);
  assert(auditoria.includes("admin.aparelhos.encerrados"));
});

Deno.test("Minha conta: autenticadores, e remover só com o código de outro", async () => {
  const { pedir, fatores, auditoria } = await logado({ outrosFatores: [{ id: "f2", verificado: false }, { id: "f3", verificado: false }] });
  assertEquals((await pedir("/v1/admin/mfa/factors/enroll", {})).status, 201);

  assertEquals((await erro(await pedir("/v1/admin/mfa/factors/f2/verify", { codigo: "000000" }))).codigo, "MFA_INVALID");
  assertEquals((await pedir("/v1/admin/mfa/factors/f2/verify", { codigo: "135 790" })).status, 200);
  fatores.find((f) => f.id === "f2")!.verificado = true;
  assert(auditoria.includes("admin.autenticador.cadastrado"));
  assertEquals((await erro(await pedir("/v1/admin/mfa/factors/f1/verify", { codigo: "482193" }))).codigo, "ALREADY_APPLIED");

  assertEquals((await pedir("/v1/admin/mfa/factors/f1", { codigo: "482193", fatorDoCodigo: "f1" }, "DELETE")).status, 400, "o código é de outro");
  assertEquals((await pedir("/v1/admin/mfa/factors/f1", undefined, "DELETE")).status, 400, "verificado só sai com código");
  assertEquals((await erro(await pedir("/v1/admin/mfa/factors/f1", { codigo: "000000", fatorDoCodigo: "f2" }, "DELETE"))).codigo, "MFA_INVALID");
  assertEquals((await pedir("/v1/admin/mfa/factors/f1", { codigo: "135790", fatorDoCodigo: "f2" }, "DELETE")).status, 200);
  assertEquals(fatores.map((f) => f.id), ["f2", "f3"]);
  assertEquals((await pedir("/v1/admin/mfa/factors/f3", undefined, "DELETE")).status, 200, "cadastro pela metade sai sem código");
  assertEquals((await pedir("/v1/admin/mfa/factors/zz", undefined, "DELETE")).status, 404);
  assert(auditoria.includes("admin.autenticador.removido"));
});
