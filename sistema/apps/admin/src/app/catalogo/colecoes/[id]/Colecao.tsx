"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarApi } from "@/lib/api";
import { paraSlug } from "@/lib/catalogo";
import { CORES, PALETAS, type Colecao, type PaginaProdutos } from "@/lib/tiposCatalogo";
import { Casca } from "../../../_painel/Casca";
import { Botao, Campo, Carregando, Escolha, Marcar } from "../../../_painel/ui";
import { useDados } from "../../../_painel/useDados";
import { useEnvio } from "../../../_painel/useEnvio";
import { SelosColecao } from "../../Colecoes";
import { EnvioFoto } from "../../EnvioFoto";
import { PreviaColecao, type RascunhoColecao } from "../../PreviaColecao";

// Página da coleção (28/09): cada coleção tem a sua, como as peças, com o formulário e a prévia na
// loja lado a lado. Coleções (D20): nome, slug, texto curto, cor entre as 5 aprovadas, capa, ordem,
// ativa e a foto do círculo do Pick your story no início (0440). Campanha (0420, D35 e D36): nome
// da campanha, edição, temporada, paleta, foto do celular (4:5) e até 3 capítulos editoriais com
// foto e as estampas de cada um. A lista fica em Catálogo → Coleções.

const LISTA = "/catalogo?aba=colecoes";

export function PaginaColecao({ id }: { id: string | null }) {
  const router = useRouter();
  const { dados, erro, recarregar } = useDados<Colecao[]>("v1/admin/collections");
  const [salvo, setSalvo] = useState(false);
  const colecao = id ? dados?.find((c) => c.id === id) : null;

  if (!dados) return <Casca kicker="CATÁLOGO · COLEÇÃO" titulo="Coleção"><Carregando erro={erro} /></Casca>;
  if (id && !colecao) return <Casca kicker="CATÁLOGO · COLEÇÃO" titulo="Coleção"><Carregando erro="Coleção não encontrada." /></Casca>;
  const [primeira, ...resto] = (colecao?.nome ?? "").split(" ");

  return (
    <Casca
      kicker={colecao ? "CATÁLOGO · COLEÇÃO" : "CATÁLOGO · NOVA COLEÇÃO"}
      topo={colecao ? colecao.nome : "Nova coleção"}
      titulo={colecao ? <>{primeira} <em style={{ color: "var(--pink-dark)" }}>{resto.join(" ")}</em></> : <>Crie uma <em style={{ color: "var(--pink-dark)" }}>coleção.</em></>}
      sub={colecao ? `/colecao/${colecao.slug} · ${colecao.produtos} ${colecao.produtos === 1 ? "peça" : "peças"} · ordem ${colecao.posicao}` : "O universo que agrupa as estampas na loja: nome, cor, capa, Pick your story e campanha."}
      acoes={<>
        <Link className="btn btn-ghost" href={LISTA}>← Coleções</Link>
        {colecao && <SelosColecao colecao={colecao} />}
      </>}
    >
      {salvo && <p role="status" className="field-help" style={{ marginTop: 0 }}>Coleção salva.</p>}
      <FormColecao key={colecao?.id ?? "nova"} colecao={colecao ?? null} colecoes={dados} aoFechar={() => router.push(LISTA)}
        aoSalvar={(novo) => {
          setSalvo(true);
          // A nova só abre na página dela depois de a lista trazê-la
          void recarregar().then(() => { if (!id) router.replace(`/catalogo/colecoes/${novo}`); });
        }} />
    </Casca>
  );
}

type Campos = Pick<RascunhoColecao, "descricao" | "chamada" | "cor" | "posicao" | "ativa" | "campanha" | "edicao" | "temporada" | "paleta" | "campanhaAtiva">;

/** Os campos sem estado próprio, como estão no formulário (para salvar e para a prévia). */
function lerCampos(f: FormData): Campos {
  const texto = (nome: string) => String(f.get(nome) ?? "").trim() || null;
  return {
    descricao: texto("descricao"), chamada: texto("chamada"), cor: String(f.get("cor") ?? "LIMAO"),
    posicao: Number(f.get("posicao") ?? 0) || 0, ativa: f.get("ativa") === "on",
    campanha: texto("campanha"), edicao: texto("edicao"), temporada: texto("temporada"),
    paleta: String(f.get("paleta") ?? "CLUB") as Campos["paleta"], campanhaAtiva: f.get("campanhaAtiva") === "on",
  };
}

export function FormColecao({ colecao, colecoes, aoFechar, aoSalvar }: { colecao: Colecao | null; colecoes: Colecao[]; aoFechar: () => void; aoSalvar: (id: string) => void }) {
  const [nome, setNome] = useState(colecao?.nome ?? "");
  const [slug, setSlug] = useState(colecao?.slug ?? "");
  const [capa, setCapa] = useState<string | null>(colecao?.capa?.caminho ?? null);
  const [capaCelular, setCapaCelular] = useState<string | null>(colecao?.capaCelular?.caminho ?? null);
  const [fotoStory, setFotoStory] = useState<string | null>(colecao?.fotoStory?.caminho ?? null);
  const [capitulos, setCapitulos] = useState<CapituloForm[]>(
    (colecao?.capitulos ?? []).map((k) => ({ rotulo: k.rotulo, titulo: k.titulo, texto: k.texto ?? "", foto: k.foto?.caminho ?? null, alt: k.foto?.alt ?? "", produtos: k.produtos })));
  const { ocupado, erro, setErro, enviar } = useEnvio<{ id: string }>((r) => aoSalvar(r.id));
  // O resto do formulário, lido a cada mudança, para a prévia na loja
  const [campos, setCampos] = useState<Campos>(() => ({
    descricao: colecao?.descricao ?? null, chamada: colecao?.chamada ?? null, cor: colecao?.cor ?? "LIMAO",
    posicao: colecao?.posicao ?? 0, ativa: colecao?.ativa ?? true, campanha: colecao?.campanha ?? null, edicao: colecao?.edicao ?? null,
    temporada: colecao?.temporada ?? null, paleta: colecao?.paleta ?? "CLUB", campanhaAtiva: colecao?.campanhaAtiva ?? false,
  }));

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const c = lerCampos(f);
    const alt = String(f.get("alt") ?? "").trim();
    if (!nome.trim() || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return setErro("Confira o nome e o endereço (só letras sem acento, números e hífen).");
    if (capa && !alt) return setErro("Descreva a capa para quem usa leitor de tela.");
    const altCelular = String(f.get("altCelular") ?? "").trim();
    if (capaCelular && !altCelular) return setErro("Descreva a foto do celular para quem usa leitor de tela.");
    const preenchidos = capitulos.filter((k) => k.rotulo.trim() || k.titulo.trim() || k.foto || k.produtos.length);
    if (preenchidos.some((k) => !k.rotulo.trim() || !k.titulo.trim())) return setErro("Cada capítulo precisa do nome (ex.: Mattina — Mercato) e do título.");
    if (preenchidos.some((k) => k.foto && !k.alt.trim())) return setErro("Descreva a foto de cada capítulo para quem usa leitor de tela.");
    if (c.campanhaAtiva && !c.campanha) return setErro("Para ligar a campanha, preencha o nome dela.");
    const corpo = {
      nome: nome.trim(), slug, descricao: c.descricao, chamada: c.chamada, cor: c.cor,
      capa: capa ? { caminho: capa, alt } : null, posicao: c.posicao, ativa: c.ativa,
      campanha: c.campanha, edicao: c.edicao, temporada: c.temporada, paleta: c.paleta, campanhaAtiva: c.campanhaAtiva,
      capaCelular: capaCelular ? { caminho: capaCelular, alt: altCelular } : null,
      fotoStory: fotoStory ? { caminho: fotoStory } : null,
      capitulos: preenchidos.map((k) => ({ rotulo: k.rotulo.trim(), titulo: k.titulo.trim(), texto: k.texto.trim() || null, foto: k.foto ? { caminho: k.foto, alt: k.alt.trim() } : null, produtos: k.produtos })),
    };
    void enviar(colecao ? chamarApi(`v1/admin/collections/${colecao.id}`, corpo, "PUT") : chamarApi("v1/admin/collections", corpo));
  }

  return (
    <section className="card" aria-label={colecao ? `Editar ${colecao.nome}` : "Nova coleção"}>
      <div className="com-previa">
        <form className="form-grid" onSubmit={salvar} onChange={(e) => setCampos(lerCampos(new FormData(e.currentTarget)))} noValidate>
          <Campo name="nome" rotulo="Nome" maxLength={60} value={nome} onChange={(e) => { setNome(e.target.value); if (!colecao) setSlug(paraSlug(e.target.value)); }} />
          <Campo name="slug" rotulo="Endereço (/colecao/…)" maxLength={80} value={slug} onChange={(e) => setSlug(paraSlug(e.target.value))} />
          <div className="full"><Campo name="descricao" rotulo="Texto curto (opcional)" maxLength={160} defaultValue={colecao?.descricao ?? ""} /></div>
          <div className="full"><Campo name="chamada" rotulo="Chamada da faixa verde (opcional)" maxLength={120} defaultValue={colecao?.chamada ?? ""}
            ajuda="Uma frase sobre o universo da coleção, sem repetir o nome. Ex.: Limões, listras e o verão italiano que não acaba." /></div>
          <Escolha name="cor" rotulo="Cor da coleção" defaultValue={colecao?.cor ?? "LIMAO"} opcoes={CORES.map(([v, t]) => [v, t] as const)} ajuda="Só as 5 cores aprovadas (D18)." />
          <Campo name="posicao" rotulo="Ordem" inputMode="numeric" maxLength={4} defaultValue={String(colecao?.posicao ?? 0)} />
          <div className="full"><EnvioFoto destino="colecao" caminho={capa} aoEnviar={setCapa} rotulo="Capa" /></div>
          {capa && <div className="full"><Campo name="alt" rotulo="Descrição da capa" maxLength={200} defaultValue={colecao?.capa?.alt ?? ""} /></div>}
          <div className="full"><Marcar name="ativa" rotulo="Coleção ativa (aparece na loja)" defaultChecked={colecao?.ativa ?? true} /></div>
          <div className="full">
            <EnvioFoto destino="colecao" caminho={fotoStory} aoEnviar={setFotoStory} rotulo="Foto do Pick your story (círculo no início)" />
            <p className="field-help">{fotoStory ? "O círculo mostra a foto inteira, sobre a cor da coleção (lettering com fundo transparente fica melhor)." : "Sem foto, o círculo mostra a peça mais nova da coleção."}</p>
            {fotoStory && <Botao variante="link" onClick={() => setFotoStory(null)}>Voltar para a peça mais nova</Botao>}
          </div>

          <h3 className="full" style={{ marginTop: 10 }}>Campanha</h3>
          <p className="field-help full" style={{ marginTop: -6 }}>
            Grave tudo com a campanha desligada e ligue quando as fotos limpas (sem texto dentro) estiverem aprovadas: aí a página da coleção vira capítulo de campanha, com a foto, a campanha, a coleção, o manifesto e os capítulos.
          </p>
          <div className="full"><Marcar name="campanhaAtiva" rotulo="Campanha ligada na loja" defaultChecked={colecao?.campanhaAtiva ?? false} /></div>
          <Campo name="campanha" rotulo="Nome da campanha (opcional)" maxLength={60} defaultValue={colecao?.campanha ?? ""} placeholder="Ciao, Estate!" />
          <Escolha name="paleta" rotulo="Paleta da página" defaultValue={colecao?.paleta ?? "CLUB"} opcoes={PALETAS} ajuda="Cada campanha pode ter a sua (D36)." />
          <Campo name="edicao" rotulo="Edição (opcional)" maxLength={30} defaultValue={colecao?.edicao ?? ""} placeholder="Coleção 01" />
          <Campo name="temporada" rotulo="Temporada (opcional)" maxLength={20} defaultValue={colecao?.temporada ?? ""} placeholder="SS26" />
          <div className="full"><EnvioFoto destino="colecao" caminho={capaCelular} aoEnviar={setCapaCelular} rotulo="Foto do celular (4:5, sem texto)" /></div>
          {capaCelular && <div className="full"><Campo name="altCelular" rotulo="Descrição da foto do celular" maxLength={200} defaultValue={colecao?.capaCelular?.alt ?? ""} /></div>}

          <h3 className="full" style={{ marginTop: 10 }}>Capítulos (até 3)</h3>
          {colecao
            ? <Capitulos colecaoId={colecao.id} capitulos={capitulos} mudar={setCapitulos} />
            : <p className="field-help full">Salve a coleção e cadastre as peças; depois os capítulos aparecem aqui.</p>}
          {erro && <p role="alert" className="field-error full">{erro}</p>}
          <div className="actions full">
            <Botao type="submit" carregando={ocupado}>Salvar coleção</Botao>
            <Botao variante="link" onClick={aoFechar}>Voltar para as coleções</Botao>
          </div>
        </form>
        <div className="com-previa-lado">
          <PreviaColecao outras={colecoes} r={{
            ...campos, id: colecao?.id ?? null, nome, slug,
            capa: capa ? { caminho: capa } : null, capaCelular: capaCelular ? { caminho: capaCelular } : null, fotoStory: fotoStory ? { caminho: fotoStory } : null,
            produtos: colecao?.produtos ?? 0, pecaMaisNova: colecao?.pecaMaisNova ?? null,
          }} />
        </div>
      </div>
    </section>
  );
}

interface CapituloForm { rotulo: string; titulo: string; texto: string; foto: string | null; alt: string; produtos: string[] }
const CAPITULO_VAZIO: CapituloForm = { rotulo: "", titulo: "", texto: "", foto: null, alt: "", produtos: [] };

// Até 3 capítulos (ex.: Mattina — Mercato · Il mercato apre cedo.), cada um com foto e as
// estampas da própria coleção que aparecem junto dele na loja.
function Capitulos({ colecaoId, capitulos, mudar }: { colecaoId: string; capitulos: CapituloForm[]; mudar: (c: CapituloForm[]) => void }) {
  const { dados } = useDados<PaginaProdutos>(`v1/admin/products?colecao=${colecaoId}`);
  const trocar = (i: number, parte: Partial<CapituloForm>) => mudar(capitulos.map((k, j) => (j === i ? { ...k, ...parte } : k)));
  return (
    <div className="full" style={{ display: "grid", gap: 14 }}>
      {capitulos.map((k, i) => (
        <fieldset key={i} className="card flat" style={{ margin: 0 }}>
          <legend style={{ fontWeight: 800, fontSize: 12 }}>Capítulo {i + 1}</legend>
          <div className="form-grid">
            <Campo rotulo="Nome do capítulo" maxLength={40} value={k.rotulo} placeholder="Mattina — Mercato" onChange={(e) => trocar(i, { rotulo: e.target.value })} />
            <Campo rotulo="Título" maxLength={80} value={k.titulo} placeholder="Il mercato apre cedo." onChange={(e) => trocar(i, { titulo: e.target.value })} />
            <div className="full"><Campo rotulo="Frase (opcional)" maxLength={160} value={k.texto} placeholder="Sol alto, sal na pele e absolutamente nenhuma pressa." onChange={(e) => trocar(i, { texto: e.target.value })} /></div>
            <div className="full"><EnvioFoto destino="colecao" caminho={k.foto} aoEnviar={(foto) => trocar(i, { foto })} rotulo="Foto do capítulo" /></div>
            {k.foto && <div className="full"><Campo rotulo="Descrição da foto" maxLength={200} value={k.alt} onChange={(e) => trocar(i, { alt: e.target.value })} /></div>}
            <div className="full">
              <span className="field-help">Estampas deste capítulo (até 8)</span>
              {!dados ? <p className="field-help">Carregando as peças…</p> : (
                <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16 }}>
                  {dados.itens.map((p) => (
                    <Marcar key={p.id} rotulo={p.nome} checked={k.produtos.includes(p.id)}
                      disabled={!k.produtos.includes(p.id) && k.produtos.length >= 8}
                      onChange={(e) => trocar(i, { produtos: e.target.checked ? [...k.produtos, p.id] : k.produtos.filter((x) => x !== p.id) })} />
                  ))}
                </div>
              )}
            </div>
          </div>
          <Botao variante="link" onClick={() => mudar(capitulos.filter((_, j) => j !== i))}>Tirar o capítulo {i + 1}</Botao>
        </fieldset>
      ))}
      {capitulos.length < 3 && <div><Botao variante="ghost" onClick={() => mudar([...capitulos, { ...CAPITULO_VAZIO }])}>Adicionar capítulo</Botao></div>}
    </div>
  );
}
