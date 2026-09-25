import type { Metadata, Viewport } from "next";
import Image from "next/image";
import { baloo, poppins } from "./fontes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Painel · T-shirt Club.br", template: "%s · Painel T-shirt Club.br" },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/marca/favicon-32.png", sizes: "32x32", type: "image/png" }] },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFCFA" },
    { media: "(prefers-color-scheme: dark)", color: "#181114" },
  ],
};

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-app="painel" className={`${baloo.variable} ${poppins.variable}`}>
      <body className="min-h-dvh bg-papel font-texto text-tinta antialiased">
        <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-campo focus:bg-branco focus:px-4 focus:py-2">
          Pular para o conteúdo
        </a>
        <header className="border-b border-linha">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
            <Image src="/marca/logo.webp" alt="T-shirt Club.br" width={96} height={66} priority className="h-10 w-auto" />
            <span className="text-sm text-tinta-suave">Painel da loja</span>
          </div>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-6xl">{children}</main>
      </body>
    </html>
  );
}
