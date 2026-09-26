import type { Metadata, Viewport } from "next";
import { baloo, fraunces, poppins } from "./fontes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Painel · T-shirt Club.br", template: "%s · Painel T-shirt Club.br" },
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/marca/favicon-32.png", sizes: "32x32", type: "image/png" }] },
};

// Painel V4 (docs/design/v4/painel): só o tema claro, como as telas de referência.
export const viewport: Viewport = { colorScheme: "light", themeColor: "#fffcfa" };

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-app="painel" data-tema="claro" className={`${fraunces.variable} ${poppins.variable} ${baloo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
