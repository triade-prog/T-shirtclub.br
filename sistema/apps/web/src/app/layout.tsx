import type { Metadata, Viewport } from "next";
import { baloo, poppins } from "./fontes";
import { Cabecalho } from "./_layout/Cabecalho";
import { Rodape } from "./_layout/Rodape";
import { RegistrarServiceWorker } from "./_pwa/RegistrarServiceWorker";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "T-shirt Club.br", template: "%s · T-shirt Club.br" },
  description: "Camisetas com estampa própria. Monte seu Club: 3 por R$ 119,99.",
  icons: {
    icon: [{ url: "/marca/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/marca/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#FFFCFA", colorScheme: "light" };

export default function LayoutLoja({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${baloo.variable} ${poppins.variable}`}>
      <body className="min-h-dvh bg-papel font-texto text-tinta antialiased">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-campo focus:bg-branco focus:px-4 focus:py-2">
          Pular para o conteúdo
        </a>
        <Cabecalho />
        <main id="conteudo" className="mx-auto w-full max-w-6xl">{children}</main>
        <Rodape />
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
