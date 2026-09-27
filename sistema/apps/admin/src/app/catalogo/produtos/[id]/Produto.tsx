"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Heart } from "lucide-react";
import { formatarReais } from "@tshirtclub/domain";
import { CardProduto } from "@tshirtclub/ui";
import { chamarApi, dataHora, mensagemDeErro } from "@/lib/api";
import { ErroSemWebp, TEXTO_SEM_WEBP, deMedidas, enviarArquivo, paraCentavos, paraMedidas, paraReais, paraSlug, paraWebp, urlFoto } from "@/lib/catalogo";
import { corpoClubComPeca, participaDoClub, promocaoDoClub, textoOfertaClub } from "@/lib/club";
import { itensPublicacao, podePublicar, type ItemPublicacao } from "@/lib/publicacao";
import { TIPOS_FOTO, type Colecao, type Foto, type ProdutoCompleto, type Promocao } from "@/lib/tiposCatalogo";
import { AjusteEstoque } from "../../../_painel/AjusteEstoque";
import { Casca } from "../../../_painel/Casca";
import { Aviso, Botao, Campo, Carregando, Escolha, Marcar, Selo } from "../../../_painel/ui";
import { useDados } from "../../../_painel/useDados";
import { useEnvio } from "../../../_painel/useEnvio";

// Cadastro da peça (tela 10, D20; desenho V5.1 "Nova peça"): identidade, fotos por ângulo,
// produto e modelagem, a prévia com o cartão da loja, "Pronta para publicar?" e a barra
// Salvar rascunho / Publicar na loja.

export function Produto({ id }: { id: string | null }) {
  const { dados: p, erro, recarregar } = useDados<ProdutoCompleto>(id ? `v1/admin/products/${id}` : null);
  const colecoes = useDados<Colecao[]>("v1/admin/collections");
  const promocoes = useDados<Promocao[]>("v1/admin/promotions");
  const atualizar = () => { void recarregar(); void promocoes.recarregar(); };

  if (id && !p) return <Casca kicker="CATÁLOGO" titulo="Peça"><Carregando erro={erro} /></Casca>;
  if (!colecoes.dados) return <Casca kicker="CATÁLOGO" titulo="Peça"><Carregando erro={colecoes.erro} /></Casca>;

  return (
    <Casca
      kicker={p ? "CATÁLOGO · PEÇA" : "CATÁLOGO · NOVA PEÇA"}
      topo={p ? p.nome : "Nova peça"}
      titulo={p ? <>{p.nome.split(" ")[0]} <em style={{ color: "var(--pink-dark)" }}>{p.nome.split(" ").slice(1).join(" ")}</em></> : <>Cadastre uma <em style={{ color: "var(--pink-dark)" }}>peça.</em></>}
      sub={p ? `${p.codigo} · ${formatarReais(p.precoCentavos)}` : "O que a cliente vê na loja e o que a equipe precisa para controlar código, estoque e publicação."}
      acoes={<>
        <Link className="btn btn-ghost" href="/catalogo">← Catálogo</Link>
        {p && (!p.ativo ? <Selo tom="expired">Inativa</Selo> : p.publicado ? <Selo tom="paid">Publicada</Selo> : <Selo tom="reserved">Rascunho</Selo>)}
      </>}
    >
      {/* A promoção do Club só chega depois; a chave refaz o formulário com ela (e a cada peça). */}
      <Cadastro key={`${p?.id ?? "nova"}-${promocoes.dados ? "p" : "s"}`} produto={p ?? null} colecoes={colecoes.dados}
        promocoes={promocoes.dados ?? null} aoMudar={atualizar} />
    </Casca>
  );
}

interface Campos { colecaoId: string; codigo: string; preco: string; descricao: string; medidas: string; ativo: boolean; club: boolean }
type Acao = "rascunho" | "publicar" | "salvar" | "despublicar";

function lerCampos(form: HTMLFormElement): Campos {
  const f = new FormData(form);
  const txt = (k: string) => String(f.get(k) ?? "");
  return { colecaoId: txt("colecaoId"), codigo: txt("codigo"), preco: txt("preco"), descricao: txt("descricao"), medidas: txt("medidas"), ativo: f.get("ativo") === "on", club: f.get("club") === "on" };
}

function Cadastro({ produto: p, colecoes, promocoes, aoMudar }: { produto: ProdutoCompleto | null; colecoes: Colecao[]; promocoes: Promocao[] | null; aoMudar: () => void }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const club = promocoes ? promocaoDoClub(promocoes) : null;
  const escolhida = club?.escopo === "ESPECIFICOS";
  // Peça nova entra no Club por padrão (a oferta é da loja toda); a existente, como está na promoção.
  const noClub = club ? (p ? participaDoClub(club, p.id) : true) : false;
  const [nome, setNome] = useState(p?.nome ?? "");
  const [slug, setSlug] = useState(p?.slug ?? "");
  const [campos, setCampos] = useState<Campos>({
    colecaoId: p?.colecaoId ?? colecoes[0]?.id ?? "", codigo: p?.codigo ?? "", preco: paraReais(p?.precoCentavos) || "49,99",
    descricao: p?.descricao ?? "", medidas: deMedidas(p?.medidas), ativo: p?.ativo ?? true, club: noClub,
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const preco = paraCentavos(campos.preco);
  const colecao = colecoes.find((c) => c.id === campos.colecaoId);
  const dadosValidos = !!nome.trim() && /^[A-Z0-9][A-Z0-9-]{1,19}$/.test(campos.codigo.trim().toUpperCase()) && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) && preco !== null && preco >= 1;
  const ofertaClub = club && (escolhida ? campos.club : true) ? textoOfertaClub(club) : null;
  const itens = itensPublicacao({
    nova: !p, dadosValidos, ativa: campos.ativo, fotos: p?.fotos ?? [], descricao: campos.descricao, medidas: campos.medidas,
    disponivel: p?.estoque.disponivel ?? 0, colecaoAtiva: colecao?.ativa ?? true, club: club ? ofertaClub : undefined,
  });

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const acao = (submitter?.getAttribute("value") ?? (p?.publicado ? "salvar" : "rascunho")) as Acao;
    setErro(null);
    setAviso(null);
    const c = lerCampos(e.currentTarget);
    const precoCentavos = paraCentavos(c.preco);
    const medidas = paraMedidas(c.medidas);
    const codigo = c.codigo.trim().toUpperCase();
    const texto = (v: string) => v.trim() || null;
    if (!nome.trim()) return setErro("Dê um nome à peça.");
    if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(codigo)) return setErro("O código usa letras, números e hífen (2 a 20), como LIM-01.");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return setErro("Confira o endereço da peça.");
    if (precoCentavos === null || precoCentavos < 1) return setErro("Informe o preço, como 49,99.");
    if (medidas === null) return setErro("Escreva as medidas uma por linha, como “busto: 104”.");
    const publicar = acao === "publicar" || acao === "salvar";
    if (acao === "publicar" && !podePublicar(itens)) {
      return setErro(`Para publicar, falta: ${itens.filter((i) => i.situacao === "FALTA").map((i) => i.texto.replace(/\.$/, "").toLowerCase()).join("; ")}.`);
    }

    const f = new FormData(e.currentTarget);
    const corpo = {
      colecaoId: c.colecaoId, codigo, slug, nome: nome.trim(), precoCentavos,
      descricao: texto(c.descricao), composicao: texto(String(f.get("composicao") ?? "")), modelagem: texto(String(f.get("modelagem") ?? "")),
      medidas, cuidados: texto(String(f.get("cuidados") ?? "")), ativo: c.ativo, publicado: publicar,
    };
    setOcupado(true);
    const r = p ? await chamarApi<{ id: string }>(`v1/admin/products/${p.id}`, corpo, "PUT") : await chamarApi<{ id: string }>("v1/admin/products", corpo);
    if (!r.ok) { setOcupado(false); return setErro(mensagemDeErro(r.codigo, r.detalhes)); }
    const idPeca = p?.id ?? r.dados.id;

    // O Club: só com "peças escolhidas" a peça entra ou sai; com "todas as peças" ela já participa.
    let erroClub: string | null = null;
    if (club && escolhida && c.club !== participaDoClub(club, idPeca)) {
      const corpoClub = corpoClubComPeca(club, idPeca, c.club);
      if (!corpoClub) erroClub = `A peça foi salva, mas é a única do Club (“${club.nome}”): para tirá-la, encerre a promoção em Promoções.`;
      else {
        const rc = await chamarApi(`v1/admin/promotions/${club.id}`, corpoClub, "PUT");
        if (!rc.ok) erroClub = `A peça foi salva, mas o Club não mudou: ${mensagemDeErro(rc.codigo, rc.detalhes)}`;
      }
    }
    setOcupado(false);
    if (!p) return router.replace(`/catalogo/produtos/${idPeca}`);
    if (erroClub) setErro(erroClub);
    else setAviso(acao === "publicar" ? "Peça publicada na loja." : acao === "despublicar" ? "A peça saiu da loja e voltou a ser rascunho." : "Peça salva.");
    aoMudar();
  }

  const capa = p?.fotos[0];
  return (
    <div className="cadastro">
      <div className="cadastro-principal">
        <form id="form-peca" ref={form} className="grid" onSubmit={salvar} onChange={() => form.current && setCampos(lerCampos(form.current))} noValidate>
          <article className="card">
            <Cabeca titulo="Identidade da peça" sub="Nome comercial, coleção e endereço público." tag="Essencial" />
            <div className="form-grid">
              <Escolha name="colecaoId" rotulo="Coleção" defaultValue={campos.colecaoId} opcoes={colecoes.map((c) => [c.id, c.ativa ? c.nome : `${c.nome} (inativa)`] as const)} />
              <Campo name="codigo" rotulo="Código interno" maxLength={20} defaultValue={campos.codigo} placeholder="LIM-01" autoCapitalize="characters" />
              <Campo name="nome" rotulo="Nome da peça" maxLength={80} value={nome} onChange={(e) => { setNome(e.target.value); if (!p) setSlug(paraSlug(e.target.value)); }} />
              <Campo name="slug" rotulo="Endereço (/produto/…)" maxLength={80} value={slug} onChange={(e) => setSlug(paraSlug(e.target.value))}
                ajuda={slug ? `Na loja: /produto/${slug}` : undefined} />
              <Campo name="preco" rotulo="Preço (R$)" inputMode="decimal" maxLength={10} defaultValue={campos.preco} />
              <CampoClub club={club} carregando={promocoes === null} marcado={campos.club} />
              <div className="full"><Campo multilinha name="descricao" rotulo="Descrição (opcional)" maxLength={2000} defaultValue={campos.descricao} placeholder="O verão italiano no peito…" /></div>
            </div>
          </article>

          <article className="card">
            <Cabeca titulo="Produto e modelagem" sub="Informações exibidas na página da peça." />
            <div className="form-grid">
              <Campo name="composicao" rotulo="Composição (opcional)" maxLength={200} defaultValue={p?.composicao ?? ""} placeholder="100% algodão" />
              <Campo name="modelagem" rotulo="Modelagem (opcional)" maxLength={200} defaultValue={p?.modelagem ?? ""} placeholder="Tamanho único, veste do P ao 42" />
              <div className="full"><Campo multilinha name="medidas" rotulo="Medidas (uma por linha, opcional)" maxLength={1200} defaultValue={campos.medidas} placeholder={"busto: 104\ncomprimento: 68"} /></div>
              <div className="full"><Campo multilinha name="cuidados" rotulo="Cuidados (opcional)" maxLength={500} defaultValue={p?.cuidados ?? ""} placeholder="Lavar do avesso…" /></div>
              <div className="full"><Marcar name="ativo" rotulo="Peça ativa (inativa, ela some da loja e não pode ser reservada)" defaultChecked={campos.ativo} /></div>
            </div>
          </article>
        </form>

        {p ? <Fotos produto={p} aoMudar={aoMudar} /> : (
          <article className="card">
            <Cabeca titulo="Fotos da peça" sub="A primeira foto vira a capa na vitrine." tag="mín. 1 foto" />
            <p className="field-help" style={{ margin: 0 }}>Salve o rascunho para acrescentar as fotos e o estoque.</p>
          </article>
        )}
      </div>

      <aside className="cadastro-lado" aria-label="Prévia e publicação">
        <article className="card previa">
          <p className="previa-rotulo">Prévia na loja</p>
          {/* Só a imagem do cartão: o mesmo componente da loja, sem ações aqui dentro */}
          <div inert className="previa-cartao">
            <CardProduto
              nome={nome.trim() || "Nome da peça"} href={`/produto/${slug}`} colecao={colecao?.nome}
              preco={preco ? formatarReais(preco) : "R$ —"} oferta={ofertaClub} selo={p && p.estoque.disponivel === 0 ? "Esgotado" : null}
              foto={capa
                // eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage
                ? <img src={urlFoto(capa.caminho)} alt="" className="absolute inset-0 size-full object-cover" />
                : <span className="previa-sem-foto">Sem foto</span>}
              favorito={<span className="absolute right-2.5 top-2.5 grid size-9.5 place-items-center rounded-full border-[1.5px] border-tinta bg-papel/90"><Heart className="size-4.5" strokeWidth={1.7} /></span>}
            />
          </div>
        </article>
        <Checklist itens={itens} />
        {p && (
          <>
            <article className="card">
              <h2>Estoque</h2>
              <div className="kv">
                <div className="kv-row"><span>Total</span><b>{p.estoque.total}</b></div>
                <div className="kv-row"><span>Reservadas</span><b>{p.estoque.reservado}</b></div>
                <div className="kv-row"><span>Vendidas</span><b>{p.estoque.vendido}</b></div>
                <div className="kv-row"><span>Disponíveis na loja</span><b className="price-total">{p.estoque.disponivel}</b></div>
              </div>
              <div style={{ marginTop: 14 }}><AjusteEstoque produtoId={p.id} nome={p.nome} aoAjustar={aoMudar} /></div>
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
          </>
        )}
      </aside>

      <div className="savebar">
        <div className="savebar-texto">
          <strong>{nome.trim() || "Nova peça"}</strong>
          <small>{!p ? "Ainda não salva" : p.publicado ? "Publicada na loja" : "Rascunho: ainda não está na loja"}</small>
        </div>
        <div className="savebar-acoes">
          {/* O primeiro botão é o do Enter nos campos: nunca tira a peça da loja */}
          {p?.publicado ? (
            <>
              <Botao type="submit" form="form-peca" value="salvar" variante="pink" carregando={ocupado}>Salvar alterações</Botao>
              <Botao type="submit" form="form-peca" value="despublicar" variante="ghost" disabled={ocupado}>Tirar da loja</Botao>
            </>
          ) : (
            <>
              <Botao type="submit" form="form-peca" value="rascunho" variante="ghost" carregando={ocupado}>{p ? "Salvar rascunho" : "Criar rascunho"}</Botao>
              {p && <Botao type="submit" form="form-peca" value="publicar" variante="pink" disabled={ocupado}>Publicar na loja</Botao>}
            </>
          )}
        </div>
        {erro && <p role="alert" className="field-error savebar-msg">{erro}</p>}
        {aviso && <p role="status" className="field-help savebar-msg">{aviso}</p>}
      </div>
    </div>
  );
}

function Cabeca({ titulo, sub, tag }: { titulo: string; sub: string; tag?: string }) {
  return (
    <div className="card-head" style={{ marginBottom: 14 }}>
      <div><h2 className="card-title">{titulo}</h2><p className="card-sub">{sub}</p></div>
      {tag && <span className="tag-cadastro">{tag}</span>}
    </div>
  );
}

/** Oferta do Club: a caixa só existe quando a promoção vale para peças escolhidas. */
function CampoClub({ club, carregando, marcado }: { club: Promocao | null; carregando: boolean; marcado: boolean }) {
  if (carregando) return <div className="field"><span className="field-label">Oferta Club</span><p className="field-help" style={{ margin: 0 }}>Carregando as promoções…</p></div>;
  if (!club) {
    return (
      <div className="field">
        <span className="field-label">Oferta Club</span>
        <p className="field-help" style={{ margin: 0 }}>Nenhuma promoção do Club ativa ou agendada. <Link href="/promocoes/nova?tipo=COMPRE_MAIS" className="btn-link">Criar em Promoções</Link></p>
      </div>
    );
  }
  const quando = club.situacao === "AGENDADA" ? ` (começa em ${dataHora(club.inicio)})` : "";
  if (club.escopo !== "ESPECIFICOS") {
    return (
      <div className="field">
        <span className="field-label">Oferta Club</span>
        <p className="field-help" style={{ margin: 0 }}>Participa: {textoOfertaClub(club)}{quando}. A promoção “{club.nome}” vale para todas as peças.</p>
      </div>
    );
  }
  return (
    <div className="field-club">
      <span className="field-label">Oferta Club</span>
      <Marcar name="club" rotulo={`Participa do Club: ${textoOfertaClub(club)}${quando}`} defaultChecked={marcado} />
    </div>
  );
}

const MARCA: Record<ItemPublicacao["situacao"], string> = { OK: "Feito", FALTA: "Falta", SUGESTAO: "Sugestão" };

function Checklist({ itens }: { itens: ItemPublicacao[] }) {
  const pronta = podePublicar(itens);
  return (
    <article className={`card checklist${pronta ? " pronta" : ""}`}>
      <h2 className="card-title" style={{ fontSize: 20 }}>{pronta ? "Pronta para publicar." : "Pronta para publicar?"}</h2>
      <ul>
        {itens.map((i) => (
          <li key={i.chave} className={`item-${i.situacao.toLowerCase()}`}>
            <span className="checklist-marca" aria-hidden="true">{i.situacao === "OK" ? "✓" : i.situacao === "FALTA" ? "!" : "·"}</span>
            <span><span className="sr-only">{MARCA[i.situacao]}: </span>{i.texto}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

// Fotos por ângulo (V5.1): as que já existem, e um lugar para cada ângulo que falta.
const ANGULOS: readonly (readonly [string, string])[] = [["FRENTE", "Frente"], ["COSTAS", "Costas"], ["DETALHE", "Detalhe da estampa"], ["VESTIDA", "Vestida (look)"]];

function Fotos({ produto: p, aoMudar }: { produto: ProdutoCompleto; aoMudar: () => void }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const acao = useEnvio(() => { setApagando(null); aoMudar(); });
  const livres = 10 - p.fotos.length;
  const faltam = ANGULOS.filter(([t]) => !p.fotos.some((f) => f.tipo === t));

  async function adicionar(e: React.ChangeEvent<HTMLInputElement>, tipoFixo?: string) {
    const arquivos = [...(e.target.files ?? [])].slice(0, livres);
    e.target.value = "";
    for (const [n, arquivo] of arquivos.entries()) {
      setEstado(`Enviando ${n + 1} de ${arquivos.length}…`);
      try {
        const { blob, largura, altura } = await paraWebp(arquivo);
        const tipo = tipoFixo ?? (p.fotos.length + n === 0 ? "FRENTE" : "DETALHE");
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
      <Cabeca titulo="Fotos da peça" sub="A primeira foto vira a capa na vitrine; as setas mudam a ordem. Viram WebP no envio; o ideal é 4:5 (em pé)." tag={`${p.fotos.length} de 10`} />
      {p.fotos.length === 0 && <Aviso tipo="yellow" titulo="A peça ainda não tem foto."><p>Sem foto, ela não pode ser publicada na loja.</p></Aviso>}
      <div className="photo-grid" style={{ marginTop: 12 }}>
        {p.fotos.map((f, i) => (
          <FotoItem key={f.id} produtoId={p.id} foto={f} posicao={i} total={p.fotos.length}
            aoMover={(d) => mover(i, d)} aoSalvar={aoMudar}
            apagando={apagando === f.id} aoApagar={() => apagando === f.id
              ? void acao.enviar(chamarApi(`v1/admin/products/${p.id}/images/${f.id}`, undefined, "DELETE"))
              : setApagando(f.id)} />
        ))}
        {livres > 0 && faltam.map(([tipo, rotulo], i) => (
          <label key={tipo} className="slot-foto">
            <span className="slot-mais" aria-hidden="true">+</span>
            {p.fotos.length === 0 && i === 0 ? `Capa · ${rotulo.toLowerCase()}` : rotulo}
            <input type="file" accept="image/*" onChange={(e) => void adicionar(e, tipo)} />
          </label>
        ))}
        {livres > 0 && (
          <label className="slot-foto">
            <span className="slot-mais" aria-hidden="true">+</span>
            {p.fotos.length === 0 && faltam.length === 0 ? "Capa" : "Mais fotos"}
            <input type="file" accept="image/*" multiple onChange={(e) => void adicionar(e)} />
          </label>
        )}
      </div>
      {acao.erro && <p role="alert" className="field-error" style={{ marginTop: 10 }}>{acao.erro}</p>}
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
    <form className="photo" onSubmit={salvar} aria-label={posicao === 0 ? "Foto 1, capa" : `Foto ${posicao + 1}`}>
      <div className="photo-quadro">
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage */}
        <img src={urlFoto(foto.caminho)} alt="" />
        {posicao === 0 && <span className="tag-capa">Capa</span>}
      </div>
      <Escolha name="tipo" rotulo="Ângulo" defaultValue={foto.tipo} opcoes={TIPOS_FOTO} />
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
