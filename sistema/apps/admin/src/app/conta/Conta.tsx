"use client";

import { useState } from "react";
import { qrComoDataUrl } from "@tshirtclub/domain";
import { chamarApi, dataHora, mensagemDeErro } from "@/lib/api";
import { paraCentavos, paraReais } from "@/lib/catalogo";
import { Casca } from "../_painel/Casca";
import { Aviso, Botao, Campo, CampoCodigo, Carregando, Escolha, Selo } from "../_painel/ui";
import { useDados } from "../_painel/useDados";
import { useEnvio } from "../_painel/useEnvio";

// Minha conta (tela 22 do protótipo; sem referência V4, no estilo do painel V4, D12, G7):
// trocar a senha, aparelhos conectados, autenticadores e as metas de vendas da loja (D26). Para remover um autenticador, o
// código vem de outro que continua cadastrado; a conta nunca fica sem o segundo fator.

interface Fator { id: string; verificado: boolean; nome?: string; criadoEm?: string }
interface Aparelho { id: string; criadaEm: string; ultimoUso: string; aparelho?: string; rede?: string; atual?: boolean }
interface Conta { email: string | null; nome: string | null; autenticadores: Fator[]; aparelhos: Aparelho[] }

/** "Mozilla/5.0 (iPhone…) … Safari" → "Safari no iPhone". */
function descreverAparelho(ua = ""): string {
  const sistema = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : null;
  const navegador = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  return navegador && sistema ? `${navegador} no ${sistema}` : sistema ?? navegador ?? "Aparelho desconhecido";
}

export function Conta() {
  const { dados, erro, recarregar } = useDados<Conta>("v1/admin/account");
  return (
    <Casca kicker="ACESSO" titulo="Minha conta" sub={dados ? `${dados.email ?? ""}${dados.nome ? ` · ${dados.nome}` : ""} · administradora` : undefined}>
      {!dados ? <Carregando erro={erro} /> : (
        <div className="grid split">
          <div className="stack">
            <TrocarSenha aoTrocar={() => void recarregar()} />
            <Aparelhos aparelhos={dados.aparelhos} aoEncerrar={() => void recarregar()} />
          </div>
          <div className="stack">
            <Metas />
            <Tamanhos />
            <Autenticadores fatores={dados.autenticadores} aoMudar={() => void recarregar()} />
            <Aviso tipo="yellow" titulo="Esqueceu a senha?">
              <p>Na tela de login, use &quot;Esqueci minha senha&quot;: o link de redefinição chega no e-mail da conta.</p>
            </Aviso>
          </div>
        </div>
      )}
    </Casca>
  );
}

interface MetasVendas { diaCentavos: number; mesCentavos: number; anoCentavos: number }

/** Metas de receita líquida da loja (D26): o Dashboard mostra o quanto já foi feito. */
function Metas() {
  const { dados, erro: erroLeitura, recarregar } = useDados<MetasVendas>("v1/admin/settings/metas");
  const [feito, setFeito] = useState(false);
  const { ocupado, erro, setErro, enviar } = useEnvio(() => { setFeito(true); void recarregar(); });

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeito(false);
    const f = new FormData(e.currentTarget);
    const metas: Partial<MetasVendas> = {};
    for (const [campo, rotulo] of [["diaCentavos", "diária"], ["mesCentavos", "mensal"], ["anoCentavos", "anual"]] as const) {
      const texto = String(f.get(campo) ?? "").trim();
      const centavos = texto === "" ? 0 : paraCentavos(texto);
      if (centavos === null) return setErro(`Confira a meta ${rotulo}: use só números, como 1.500,00.`);
      if (centavos > 2_000_000_000) return setErro(`A meta ${rotulo} passa do limite de R$ 20 milhões.`);
      metas[campo] = centavos;
    }
    void enviar(chamarApi("v1/admin/settings/metas", metas, "PUT"));
  }

  return (
    <section className="card" id="metas" aria-labelledby="metas-titulo">
      <h2 id="metas-titulo">Metas de vendas</h2>
      <p className="field-help">Receita líquida da loja: peças e frete, menos descontos e estornos. Aparecem no Dashboard; 7 e 30 dias usam a meta diária. Deixe em branco para não ter meta.</p>
      {!dados ? <Carregando erro={erroLeitura} /> : (
        <form onSubmit={salvar} noValidate key={`${dados.diaCentavos}-${dados.mesCentavos}-${dados.anoCentavos}`}>
          <div className="stack">
            <Campo name="diaCentavos" rotulo="Meta diária (R$)" inputMode="decimal" placeholder="0,00" defaultValue={dados.diaCentavos ? paraReais(dados.diaCentavos) : ""} />
            <Campo name="mesCentavos" rotulo="Meta mensal (R$)" inputMode="decimal" placeholder="0,00" defaultValue={dados.mesCentavos ? paraReais(dados.mesCentavos) : ""} />
            <Campo name="anoCentavos" rotulo="Meta anual (R$)" inputMode="decimal" placeholder="0,00" defaultValue={dados.anoCentavos ? paraReais(dados.anoCentavos) : ""} />
          </div>
          {erro && <p className="field-error" role="alert">{erro}</p>}
          <div className="actions mt"><Botao type="submit" carregando={ocupado}>Salvar metas</Botao></div>
          {feito && <p className="field-help" role="status">Metas salvas.</p>}
        </form>
      )}
    </section>
  );
}

interface NomesTamanhos { unico: string; plus: string }

/** Nomes dos tamanhos (0370): os mesmos na loja, no painel e no WhatsApp. */
function Tamanhos() {
  const { dados, erro: erroLeitura, recarregar } = useDados<NomesTamanhos>("v1/admin/settings/tamanhos");
  const [feito, setFeito] = useState(false);
  const { ocupado, erro, setErro, enviar } = useEnvio(() => { setFeito(true); void recarregar(); });

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeito(false);
    const f = new FormData(e.currentTarget);
    const nomes = { unico: String(f.get("unico") ?? "").trim(), plus: String(f.get("plus") ?? "").trim() };
    if ([nomes.unico, nomes.plus].some((n) => n.length < 2 || n.length > 40)) return setErro("Cada nome tem de 2 a 40 letras.");
    void enviar(chamarApi("v1/admin/settings/tamanhos", nomes, "PUT"));
  }

  return (
    <section className="card" id="tamanhos" aria-labelledby="tamanhos-titulo">
      <h2 id="tamanhos-titulo">Tamanhos</h2>
      <p className="field-help">Como cada tamanho aparece na loja, na sacola, no painel e no WhatsApp. A loja atualiza na hora.</p>
      {!dados ? <Carregando erro={erroLeitura} /> : (
        <form onSubmit={salvar} noValidate key={`${dados.unico}-${dados.plus}`}>
          <div className="stack">
            <Campo name="unico" rotulo="Único" maxLength={40} defaultValue={dados.unico} />
            <Campo name="plus" rotulo="Plus" maxLength={40} defaultValue={dados.plus} />
          </div>
          {erro && <p className="field-error" role="alert">{erro}</p>}
          <div className="actions mt"><Botao type="submit" carregando={ocupado}>Salvar nomes</Botao></div>
          {feito && <p className="field-help" role="status">Nomes salvos.</p>}
        </form>
      )}
    </section>
  );
}

function TrocarSenha({ aoTrocar }: { aoTrocar: () => void }) {
  const [feito, setFeito] = useState(false);
  const [versao, setVersao] = useState(0);
  const { ocupado, erro, setErro, enviar } = useEnvio(() => { setFeito(true); setVersao((v) => v + 1); aoTrocar(); });

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeito(false);
    const f = new FormData(e.currentTarget);
    const atual = String(f.get("atual") ?? "");
    const nova = String(f.get("nova") ?? "");
    if (!atual) return setErro("Digite a senha atual.");
    if (nova.length < 12) return setErro("A nova senha precisa ter pelo menos 12 caracteres.");
    if (nova !== String(f.get("repetir") ?? "")) return setErro("As duas novas senhas não são iguais.");
    if (nova === atual) return setErro("A nova senha precisa ser diferente da atual.");
    void enviar(chamarApi("v1/admin/account/password", { atual, nova }, "PUT"));
  }

  return (
    <form className="card" onSubmit={salvar} noValidate key={versao}>
      <h2>Trocar senha</h2>
      <div className="stack">
        <Campo name="atual" type="password" rotulo="Senha atual" autoComplete="current-password" maxLength={128} />
        <Campo name="nova" type="password" rotulo="Nova senha" autoComplete="new-password" maxLength={128} ajuda="Pelo menos 12 caracteres." />
        <Campo name="repetir" type="password" rotulo="Repita a nova senha" autoComplete="new-password" maxLength={128} />
      </div>
      {erro && <p className="field-error" role="alert">{erro === mensagemDeErro("INVALID_CREDENTIALS") ? "A senha atual não confere." : erro}</p>}
      <div className="actions mt"><Botao type="submit" carregando={ocupado}>Salvar nova senha</Botao></div>
      {feito && <p className="field-help" role="status">Senha trocada. Os outros aparelhos saíram da conta e um aviso foi para o seu e-mail.</p>}
      <p className="field-help">Ao salvar, a senha também é conferida numa lista de senhas vazadas. Os outros aparelhos conectados saem da conta, e você recebe um e-mail avisando da troca.</p>
    </form>
  );
}

function Aparelhos({ aparelhos, aoEncerrar }: { aparelhos: Aparelho[]; aoEncerrar: () => void }) {
  const { ocupado, erro, enviar } = useEnvio(aoEncerrar);
  const outros = aparelhos.filter((a) => !a.atual).length;
  return (
    <section className="card" aria-labelledby="aparelhos-titulo">
      <h2 id="aparelhos-titulo">Aparelhos conectados</h2>
      <ul className="list" aria-label="Aparelhos conectados">
        {aparelhos.map((a) => (
          <li key={a.id} className="row">
            <span className="micro muted">{a.atual ? "Agora" : dataHora(a.ultimoUso)}</span>
            <div>
              <b>{descreverAparelho(a.aparelho)}</b>
              <p className="meta">Entrou em {dataHora(a.criadaEm)}{a.rede ? ` · rede ${a.rede}` : ""}</p>
            </div>
            {a.atual ? <Selo tom="paid">Este aparelho</Selo> : <span />}
          </li>
        ))}
      </ul>
      {erro && <p className="field-error" role="alert">{erro}</p>}
      <div className="actions mt">
        <Botao variante="ghost" disabled={outros === 0} carregando={ocupado} onClick={() => void enviar(chamarApi("v1/admin/account/sessions/revoke-others", {}))}>
          Sair de todos os outros aparelhos
        </Botao>
      </div>
    </section>
  );
}

function Autenticadores({ fatores, aoMudar }: { fatores: Fator[]; aoMudar: () => void }) {
  const [removendo, setRemovendo] = useState<string | null>(null);
  return (
    <section className="card" aria-labelledby="autenticador-titulo">
      <h2 id="autenticador-titulo">Autenticador</h2>
      <p className="field-help">Obrigatório para entrar no painel. Mantenha dois cadastrados: se perder um celular, o outro continua funcionando.</p>
      {fatores.length === 1 && <p className="field-help"><b>Só um cadastrado.</b> Cadastre um segundo, em outro celular ou num gerenciador de senhas.</p>}
      <ul className="list mt" aria-label="Autenticadores cadastrados">
        {fatores.map((f, i) => (
          <li key={f.id} className="stack">
            <div className="row">
              <span className="micro muted">{i + 1}º</span>
              <div><b>{f.nome || "Autenticador"}</b>{f.criadoEm && <p className="meta">Cadastrado em {dataHora(f.criadoEm)}</p>}</div>
              {removendo !== f.id && (
                <Botao variante="ghost" disabled={fatores.length < 2} onClick={() => setRemovendo(f.id)} aria-label={`Remover ${f.nome || `autenticador ${i + 1}`}`}>Remover</Botao>
              )}
            </div>
            {removendo === f.id && (
              <RemoverFator alvo={f} outros={fatores.filter((o) => o.id !== f.id)} aoCancelar={() => setRemovendo(null)} aoRemover={() => { setRemovendo(null); aoMudar(); }} />
            )}
          </li>
        ))}
      </ul>
      <NovoFator aoCadastrar={aoMudar} />
      <p className="field-help">Para remover um autenticador, digite um código de outro que continue cadastrado.</p>
    </section>
  );
}

function RemoverFator({ alvo, outros, aoCancelar, aoRemover }: { alvo: Fator; outros: Fator[]; aoCancelar: () => void; aoRemover: () => void }) {
  const { ocupado, erro, setErro, enviar } = useEnvio(aoRemover);
  function remover(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const codigo = String(f.get("codigo") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(codigo)) return setErro("Digite os 6 números do outro autenticador.");
    void enviar(chamarApi(`v1/admin/mfa/factors/${alvo.id}`, { codigo, fatorDoCodigo: String(f.get("fator")) }, "DELETE"));
  }
  return (
    <form className="decision" onSubmit={remover} noValidate>
      <Escolha name="fator" rotulo="Código de qual autenticador" opcoes={outros.map((o, i) => [o.id, o.nome || `Outro autenticador ${i + 1}`] as const)} />
      <CampoCodigo rotulo="Código de 6 números"
        erro={erro ? (erro === mensagemDeErro("MFA_INVALID") ? "Código errado ou vencido. Use o que aparece agora no app." : erro) : undefined} />
      <div className="actions">
        <Botao type="submit" variante="danger" carregando={ocupado}>Remover autenticador</Botao>
        <Botao variante="link" onClick={aoCancelar}>Voltar</Botao>
      </div>
    </form>
  );
}

function NovoFator({ aoCadastrar }: { aoCadastrar: () => void }) {
  const [cadastro, setCadastro] = useState<{ factorId: string; qrCode: string; segredo: string } | null>(null);
  const { ocupado, erro, setErro, enviar } = useEnvio(() => { setCadastro(null); aoCadastrar(); });

  async function comecar() {
    const r = await chamarApi<{ factorId: string; qrCode: string; segredo: string }>("v1/admin/mfa/factors/enroll", {});
    if (!r.ok) return setErro(mensagemDeErro(r.codigo, r.detalhes));
    setErro(null);
    setCadastro(r.dados);
  }
  async function desistir() {
    // Cadastro pela metade sai sem código.
    if (cadastro) await chamarApi(`v1/admin/mfa/factors/${cadastro.factorId}`, undefined, "DELETE");
    setCadastro(null);
    setErro(null);
  }
  function confirmar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const codigo = String(new FormData(e.currentTarget).get("codigo") ?? "").replace(/\s/g, "");
    if (!/^\d{6}$/.test(codigo)) return setErro("Digite os 6 números que aparecem no app.");
    void enviar(chamarApi(`v1/admin/mfa/factors/${cadastro!.factorId}/verify`, { codigo }));
  }

  if (!cadastro) {
    return (
      <div className="actions mt">
        <Botao variante="citron" onClick={() => void comecar()}>Adicionar autenticador</Botao>
        {erro && <p className="field-error" role="alert">{erro}</p>}
      </div>
    );
  }
  return (
    <form className="decision" onSubmit={confirmar} noValidate>
      <div className="qr">
        {/* eslint-disable-next-line @next/next/no-img-element -- QR em data: vindo do Supabase Auth */}
        <img src={qrComoDataUrl(cadastro.qrCode)} alt="QR code para cadastrar o autenticador" width={200} height={200} />
        <p className="field-help">Sem câmera? Digite esta chave no app: <code>{cadastro.segredo}</code></p>
      </div>
      <CampoCodigo rotulo="Código que aparece no app"
        erro={erro ? (erro === mensagemDeErro("MFA_INVALID") ? "Código errado ou vencido. Use o que aparece agora no app." : erro) : undefined} />
      <div className="actions">
        <Botao type="submit" carregando={ocupado}>Confirmar autenticador</Botao>
        <Botao variante="link" onClick={() => void desistir()}>Cancelar</Botao>
      </div>
    </form>
  );
}
