"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatarReais } from "@tshirtclub/domain";
import { chamarApi, dataHora, mensagemDeErro } from "@/lib/api";
import { ErroSemWebp, TEXTO_SEM_WEBP, deMedidas, enviarArquivo, paraCentavos, paraMedidas, paraReais, paraSlug, paraWebp, urlFoto } from "@/lib/catalogo";
import { TIPOS_FOTO, type Colecao, type Foto, type ProdutoCompleto } from "@/lib/tiposCatalogo";
import { AjusteEstoque } from "../../../_painel/AjusteEstoque";
import { Casca } from "../../../_painel/Casca";
import { Aviso, Botao, Campo, Carregando, Escolha, Marcar, Selo } from "../../../_painel/ui";
import { useDados } from "../../../_painel/useDados";
import { useEnvio } from "../../../_painel/useEnvio";

export function Produto({ id }: { id: string | null }) {
  const { dados: p, erro, recarregar } = useDados<ProdutoCompleto>(id ? `v1/admin/products/${id}` : null);
  const colecoes = useDados<Colecao[]>("v1/admin/collections");
  const atualizar = () => void recarregar();

  if (id && !p) return <Casca kicker="CATÁLOGO" titulo="Peça"><Carregando erro={erro} /></Casca>;
  if (!colecoes.dados) return <Casca kicker="CATÁLOGO" titulo="Peça"><Carregando erro={colecoes.erro} /></Casca>;

  return (
    <Casca
      kicker="CATÁLOGO"
      topo={p ? p.nome : "Nova peça"}
      titulo={p ? <>{p.nome.split(" ")[0]} <em style={{ color: "var(--pink-dark)" }}>{p.nome.split(" ").slice(1).join(" ")}</em></> : <>Nova <em style={{ color: "var(--pink-dark)" }}>peça</em></>}
      sub={p ? `${p.codigo} · ${formatarReais(p.precoCentavos)}` : "Preencha os dados; as fotos e o estoque aparecem depois de salvar."}
      acoes={<>
        <Link className="btn btn-ghost" href="/catalogo">← Catálogo</Link>
        {p && (!p.ativo ? <Selo tom="expired">Inativa</Selo> : p.publicado ? <Selo tom="paid">Publicada</Selo> : <Selo tom="reserved">Rascunho</Selo>)}
      </>}
    >
      <section className="grid split">
        <div className="grid">
          <Dados produto={p ?? null} colecoes={colecoes.dados} aoSalvar={atualizar} />
          {p && <Fotos produto={p} aoMudar={atualizar} />}
        </div>
        {p && (
          <aside className="grid" aria-label="Estoque">
            <article className="card">
              <h2>Estoque</h2>
              <div className="kv">
                <div className="kv-row"><span>Total</span><b>{p.estoque.total}</b></div>
                <div className="kv-row"><span>Reservadas</span><b>{p.estoque.reservado}</b></div>
                <div className="kv-row"><span>Vendidas</span><b>{p.estoque.vendido}</b></div>
                <div className="kv-row"><span>Disponíveis na loja</span><b className="price-total">{p.estoque.disponivel}</b></div>
              </div>
              <div style={{ marginTop: 14 }}><AjusteEstoque produtoId={p.id} nome={p.nome} aoAjustar={atualizar} /></div>
            </article>
            <article className="card">
              <h2>Movimentos</h2>
              {p.movimentos.length === 0 ? <p className="muted" style={{ fontSize: 11, margin: 0 }}>Nenhum movimento ainda.</p> : (
                <ol className="timeline" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {p.movimentos.map((m, i) => (
                    <li key={i} className="event">
                      <span className={`event-dot${m.qtd < 0 ? " muted" : ""}`} aria-hidden="true" />
                      <div><b>{m.qtd > 0 ? `+${m.qtd}` : m.qtd} · {m.tipo.toLowerCase()}</b><span>{dataHora(m.em)}{m.motivo ? ` · ${m.motivo}` : ""}</span></div>
                    </li>
                  ))}
                </ol>
              )}
            </article>
          </aside>
        )}
      </section>
    </Casca>
  );
}

function Dados({ produto: p, colecoes, aoSalvar }: { produto: ProdutoCompleto | null; colecoes: Colecao[]; aoSalvar: () => void }) {
  const router = useRouter();
  const [nome, setNome] = useState(p?.nome ?? "");
  const [slug, setSlug] = useState(p?.slug ?? "");
  const [salvo, setSalvo] = useState(false);
  const { ocupado, erro, setErro, enviar } = useEnvio<{ id: string }>((d) => {
    if (!p) return router.replace(`/catalogo/produtos/${d.id}`);
    setSalvo(true);
    aoSalvar();
  });

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvo(false);
    const f = new FormData(e.currentTarget);
    const texto = (k: string) => String(f.get(k) ?? "").trim() || null;
    const preco = paraCentavos(String(f.get("preco") ?? ""));
    const medidas = paraMedidas(String(f.get("medidas") ?? ""));
    const codigo = String(f.get("codigo") ?? "").trim().toUpperCase();
    if (!nome.trim()) return setErro("Dê um nome à peça.");
    if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(codigo)) return setErro("O código usa letras, números e hífen (2 a 20), como LIM-01.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return setErro("Confira o endereço da peça.");
    if (preco === null || preco < 1) return setErro("Informe o preço, como 49,99.");
    if (medidas === null) return setErro("Escreva as medidas uma por linha, como “busto: 104”.");
    const corpo = {
      colecaoId: String(f.get("colecaoId")), codigo, slug, nome: nome.trim(), precoCentavos: preco,
      descricao: texto("descricao"), composicao: texto("composicao"), modelagem: texto("modelagem"), medidas, cuidados: texto("cuidados"),
      ativo: f.get("ativo") === "on", publicado: f.get("publicado") === "on",
    };
    void enviar(p ? chamarApi(`v1/admin/products/${p.id}`, corpo, "PUT") : chamarApi("v1/admin/products", corpo));
  }

  return (
    <article className="card">
      <h2>Dados da peça</h2>
      <form className="form-grid" onSubmit={salvar} noValidate>
        <Escolha name="colecaoId" rotulo="Coleção" defaultValue={p?.colecaoId ?? colecoes[0]?.id} opcoes={colecoes.map((c) => [c.id, c.nome] as const)} />
        <Campo name="codigo" rotulo="Código" maxLength={20} defaultValue={p?.codigo ?? ""} placeholder="LIM-01" />
        <Campo name="nome" rotulo="Nome" maxLength={80} value={nome} onChange={(e) => { setNome(e.target.value); if (!p) setSlug(paraSlug(e.target.value)); }} />
        <Campo name="slug" rotulo="Endereço (/produto/…)" maxLength={80} value={slug} onChange={(e) => setSlug(paraSlug(e.target.value))} />
        <Campo name="preco" rotulo="Preço (R$)" inputMode="decimal" maxLength={10} defaultValue={paraReais(p?.precoCentavos) || "49,99"} />
        <div />
        <div className="full"><Campo multilinha name="descricao" rotulo="Descrição (opcional)" maxLength={2000} defaultValue={p?.descricao ?? ""} placeholder="O verão italiano no peito…" /></div>
        <Campo name="composicao" rotulo="Composição (opcional)" maxLength={200} defaultValue={p?.composicao ?? ""} placeholder="100% algodão" />
        <Campo name="modelagem" rotulo="Modelagem (opcional)" maxLength={200} defaultValue={p?.modelagem ?? ""} placeholder="Tamanho único, veste do P ao 42" />
        <div className="full"><Campo multilinha name="medidas" rotulo="Medidas (uma por linha, opcional)" maxLength={1200} defaultValue={deMedidas(p?.medidas)} placeholder={"busto: 104\ncomprimento: 68"} /></div>
        <div className="full"><Campo multilinha name="cuidados" rotulo="Cuidados (opcional)" maxLength={500} defaultValue={p?.cuidados ?? ""} placeholder="Lavar do avesso…" /></div>
        <div className="full actions">
          <Marcar name="ativo" rotulo="Peça ativa" defaultChecked={p?.ativo ?? true} />
          <Marcar name="publicado" rotulo="Publicada na loja (precisa de pelo menos 1 foto)" defaultChecked={p?.publicado ?? false} />
        </div>
        {erro && <p role="alert" className="field-error full">{erro}</p>}
        {salvo && <p role="status" className="field-help full">Peça salva.</p>}
        <div className="actions full"><Botao type="submit" carregando={ocupado}>{p ? "Salvar a peça" : "Criar a peça"}</Botao></div>
      </form>
    </article>
  );
}

function Fotos({ produto: p, aoMudar }: { produto: ProdutoCompleto; aoMudar: () => void }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const acao = useEnvio(() => { setApagando(null); aoMudar(); });

  async function adicionar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])].slice(0, 10 - p.fotos.length);
    e.target.value = "";
    for (const [n, arquivo] of arquivos.entries()) {
      setEstado(`Enviando ${n + 1} de ${arquivos.length}…`);
      try {
        const { blob, largura, altura } = await paraWebp(arquivo);
        const tipo = p.fotos.length + n === 0 ? "FRENTE" : "DETALHE";
        const r = await chamarApi<{ foto: Foto; envio: { url: string } }>(`v1/admin/products/${p.id}/images`, { tipo, alt: p.nome, largura, altura });
        if (!r.ok) { setEstado(mensagemDeErro(r.codigo, r.detalhes)); break; }
        if (!(await enviarArquivo(r.dados.envio.url, blob))) {
          // A foto já foi registrada: sem o arquivo, ela sai, para não aparecer quebrada na loja.
          if (r.dados.foto.id) await chamarApi(`v1/admin/products/${p.id}/images/${r.dados.foto.id}`, undefined, "DELETE");
          setEstado("Não conseguimos enviar a foto. Tente de novo.");
          break;
        }
      } catch (e) {
        setEstado(e instanceof ErroSemWebp ? TEXTO_SEM_WEBP : "Um dos arquivos não é uma imagem que o navegador consiga abrir.");
        break;
      }
      setEstado(null);
    }
    aoMudar();
  }

  function mover(i: number, d: number) {
    const ids = p.fotos.map((f) => f.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    void acao.enviar(chamarApi(`v1/admin/products/${p.id}/images/order`, { ids }, "PATCH"));
  }

  return (
    <article className="card">
      <h2>Fotos <span className="muted" style={{ fontSize: 13, fontFamily: "var(--font-poppins)" }}>({p.fotos.length} de 10)</span></h2>
      <p className="field-help" style={{ marginTop: 0 }}>A primeira foto é a capa. Viram WebP no envio; o ideal é 4:5 (em pé). Cada foto precisa de uma descrição.</p>
      {p.fotos.length === 0 && <Aviso tipo="yellow" titulo="A peça ainda não tem foto."><p>Sem foto, ela não pode ser publicada na loja.</p></Aviso>}
      <div className="photo-grid" style={{ marginTop: 12 }}>
        {p.fotos.map((f, i) => (
          <FotoItem key={f.id} produtoId={p.id} foto={f} posicao={i} total={p.fotos.length}
            aoMover={(d) => mover(i, d)} aoSalvar={aoMudar}
            apagando={apagando === f.id} aoApagar={() => apagando === f.id
              ? void acao.enviar(chamarApi(`v1/admin/products/${p.id}/images/${f.id}`, undefined, "DELETE"))
              : setApagando(f.id)} />
        ))}
      </div>
      {acao.erro && <p role="alert" className="field-error" style={{ marginTop: 10 }}>{acao.erro}</p>}
      {p.fotos.length < 10 && (
        <div className="actions" style={{ marginTop: 14 }}>
          <label className="file">Acrescentar fotos<input type="file" accept="image/*" multiple onChange={adicionar} /></label>
        </div>
      )}
      {estado && <p className="field-help" role="status">{estado}</p>}
    </article>
  );
}

function FotoItem({ produtoId, foto, posicao, total, aoMover, aoSalvar, apagando, aoApagar }: {
  produtoId: string; foto: Foto & { id: string }; posicao: number; total: number;
  aoMover: (d: number) => void; aoSalvar: () => void; apagando: boolean; aoApagar: () => void;
}) {
  const { ocupado, erro, setErro, enviar } = useEnvio(aoSalvar);
  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const alt = String(f.get("alt") ?? "").trim();
    if (!alt) return setErro("Descreva a foto.");
    void enviar(chamarApi(`v1/admin/products/${produtoId}/images/${foto.id}`, { tipo: String(f.get("tipo")), alt }, "PATCH"));
  }
  return (
    <form className="photo" onSubmit={salvar} aria-label={`Foto ${posicao + 1}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage */}
      <img src={urlFoto(foto.caminho)} alt="" />
      <Escolha name="tipo" rotulo={posicao === 0 ? "Tipo · capa" : "Tipo"} defaultValue={foto.tipo} opcoes={TIPOS_FOTO} />
      <Campo name="alt" rotulo="Descrição" maxLength={200} defaultValue={foto.alt ?? ""} erro={erro ?? undefined} />
      <div className="mini-actions">
        <Botao type="submit" variante="citron" carregando={ocupado}>Salvar</Botao>
        <Botao variante="ghost" disabled={posicao === 0} onClick={() => aoMover(-1)} aria-label={`Mover a foto ${posicao + 1} para antes`}>←</Botao>
        <Botao variante="ghost" disabled={posicao === total - 1} onClick={() => aoMover(1)} aria-label={`Mover a foto ${posicao + 1} para depois`}>→</Botao>
        <Botao variante={apagando ? "danger" : "ghost"} onClick={aoApagar} aria-label={apagando ? "Confirmar: apagar a foto" : `Apagar a foto ${posicao + 1}`}>{apagando ? "Apagar?" : "✕"}</Botao>
      </div>
    </form>
  );
}
