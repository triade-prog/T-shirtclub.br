import type { Metadata, Viewport } from "next";
import { baloo, fraunces, poppins } from "./fontes";
import { Cabecalho } from "./_layout/Cabecalho";
import { Rodape } from "./_layout/Rodape";
import { RegistrarServiceWorker } from "./_pwa/RegistrarServiceWorker";
import { ContarVisita } from "./_acessos/ContarVisita";
import { AvisoSacola } from "./_sacola/AvisoSacola";
import { PopupVip } from "./_vip/PopupVip";
import { buscarOfertaVip } from "@/lib/catalogo";
import { TagGoogle } from "./_anuncios/TagGoogle";
import { idAnuncios } from "@/lib/anuncios";
import { compartilhar } from "@/lib/compartilhar";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "T-shirt Club.br", template: "%s · T-shirt Club.br" },
  description: "Camisetas com estampa própria. Monte seu Club: 3 por R$ 119,99.",
  // Prévia do link no WhatsApp e nas redes: a arte da loja, até a página ter foto própria
  openGraph: compartilhar({ descricao: "Camisetas com estampa própria. Monte seu Club: 3 por R$ 119,99." }),
  twitter: { card: "summary_large_image" },
  icons: {
    icon: [{ url: "/marca/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/marca/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#FFF9F5", colorScheme: "light" };

export default async function LayoutLoja({ children }: { children: React.ReactNode }) {
  // Lido a cada pedido (as páginas são dinâmicas por causa do nonce): ligar ou trocar a conta não pede build novo
  const anuncios = idAnuncios(process.env.GOOGLE_ADS_ID);
  return (
    <html lang="pt-BR" className={`${fraunces.variable} ${poppins.variable} ${baloo.variable}`}>
      <body className="min-h-dvh bg-papel font-texto text-tinta antialiased">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-campo focus:bg-branco focus:px-4 focus:py-2">
          Pular para o conteúdo
        </a>
        <Cabecalho />
        {/* Os blocos de ponta a ponta (tc-sangria) saem do <main>; com barra de rolagem fixa, o 100vw
            passa meia barra de cada lado, e este corte evita a rolagem lateral (29/09) */}
        <div className="overflow-x-clip">
          <main id="conteudo" className="mx-auto w-full max-w-7xl">{children}</main>
        </div>
        <Rodape />
        <RegistrarServiceWorker />
        <ContarVisita />
        <AvisoSacola />
        <PopupVip beneficio={await buscarOfertaVip()} />
        {anuncios && <TagGoogle id={anuncios} />}
      </body>
    </html>
  );
}
