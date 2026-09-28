"use client";

import { CartaoLook, SecaoVitrine, classeCartaoLook, classeGradeLooks } from "@tshirtclub/ui";
import { urlFoto } from "@/lib/catalogo";
import type { Look, ProdutoLinha } from "@/lib/tiposCatalogo";
import { JanelaPrevia } from "../_painel/JanelaPrevia";

/** O look como está no formulário agora, salvo ou não. */
export interface RascunhoLook { id: string | null; titulo: string; foto: string | null; posicao: number; ativo: boolean; produtos: string[] }

/**
 * Prévia do Shop the Look na loja, com o que está no formulário: a seção do início com os looks
 * ativos na ordem da loja (ordem e título) e o número de cada um. As peças que ainda não estão na
 * loja (rascunho ou inativas) não aparecem, como lá.
 */
export function PreviaLook({ r, outros, produtos }: { r: RascunhoLook; outros: Look[]; produtos: ProdutoLinha[] | null }) {
  const naLoja = new Map((produtos ?? []).filter((p) => p.publicado && p.ativo).map((p) => [p.id, p]));
  const titulo = r.titulo.trim() || "Título do look";
  const looks = [
    ...outros.filter((l) => l.ativo && l.id !== r.id).map((l) => ({ id: l.id, titulo: l.titulo, posicao: l.posicao, foto: l.foto.caminho as string | null, produtos: l.produtos.map((p) => p.id) })),
    ...(r.ativo ? [{ id: r.id ?? "novo", titulo, posicao: r.posicao, foto: r.foto, produtos: r.produtos }] : []),
  ].sort((a, b) => a.posicao - b.posicao || a.titulo.localeCompare(b.titulo, "pt-BR"));

  return (
    <JanelaPrevia rotulo="Prévia na loja">
      {!r.ativo && <p className="m-0 px-5 py-3 text-center text-xs font-semibold text-tinta-suave">Look inativo: não aparece na loja.</p>}
      {looks.length > 0 && (
        <SecaoVitrine sobretitulo="A mesma T-shirt, outra você" titulo="Shop the Look">
          <ul className={classeGradeLooks}>
            {looks.map((l, i) => (
              <li key={l.id} className={classeCartaoLook}>
                <CartaoLook numero={i + 1} titulo={l.titulo}
                  produtos={l.produtos.flatMap((id) => { const p = naLoja.get(id); return p ? [{ id: p.id, nome: p.nome, href: "#" }] : []; })}
                  foto={l.foto
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage, dentro da prévia
                    ? <img src={urlFoto(l.foto)} alt="" className="absolute inset-0 size-full object-cover" />
                    : <span className="absolute inset-0 grid place-items-center bg-algodao text-xs font-bold text-tinta-suave">Sem foto</span>} />
              </li>
            ))}
          </ul>
        </SecaoVitrine>
      )}
    </JanelaPrevia>
  );
}
