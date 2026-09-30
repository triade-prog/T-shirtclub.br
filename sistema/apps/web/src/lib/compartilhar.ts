// Prévia do link quando alguém compartilha a loja no WhatsApp, Instagram ou Facebook (Open Graph).
// Sem foto própria, vale a arte da loja (public/marca/compartilhar.png, gerada por
// scripts/gerar-compartilhar.mjs com o preço do Club desenhado: se o preço mudar, gere de novo).
// Os endereços relativos viram absolutos pelo metadataBase, que o Next preenche na Vercel.
import type { Metadata } from "next";

type OpenGraph = NonNullable<Metadata["openGraph"]>;

export const IMAGEM_LOJA = {
  url: "/marca/compartilhar.png",
  width: 1200,
  height: 630,
  alt: "T-shirt Club.br: camisetas com estampa própria. 3 T-shirts por R$ 119,99.",
};

/** O Next troca o openGraph inteiro de uma página para a outra: cada página monta o seu por aqui. */
export function compartilhar(p: { titulo?: string; descricao?: string; url?: string; imagem?: { url: string; alt: string } } = {}): OpenGraph {
  return {
    type: "website",
    locale: "pt_BR",
    siteName: "T-shirt Club.br",
    ...(p.titulo ? { title: p.titulo } : {}),
    ...(p.descricao ? { description: p.descricao } : {}),
    ...(p.url ? { url: p.url } : {}),
    images: [p.imagem ?? IMAGEM_LOJA],
  };
}
