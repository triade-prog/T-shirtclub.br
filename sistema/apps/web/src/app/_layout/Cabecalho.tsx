import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { BotaoVoltar } from "./BotaoVoltar";

// Cabeçalho V4 (D24): faixa rosa da oferta, logo no centro, sacola em pílula de adesivo e
// a faixa de três cores embaixo.
export function Cabecalho() {
  return (
    <header className="sticky top-0 z-30">
      <p className="m-0 border-b-2 border-tinta bg-rosa px-4 py-2 text-center text-[11px] font-extrabold uppercase tracking-[0.11em] text-no-rosa">
        Monte seu Club: <b className="rounded-[4px] bg-citrino px-1.5 py-0.5 text-no-citrino">3 camisetas por R$ 119,99</b>
      </p>
      <div className="border-b-2 border-tinta bg-papel/95 backdrop-blur-md">
        <div className="mx-auto grid h-18 max-w-7xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-3.5 md:h-21.5 md:px-5">
          <BotaoVoltar />
          <Link href="/" className="rounded-campo" aria-label="T-shirt Club.br, página inicial">
            <Image src="/marca/logo.webp" alt="" width={160} height={110} priority className="h-12 w-auto md:h-15.5" />
          </Link>
          <Link
            href="/sacola"
            className="flex h-11 items-center gap-2 justify-self-end rounded-pilula border-2 border-tinta bg-papel px-3 text-xs font-extrabold shadow-adesivo-sm"
          >
            <ShoppingBag aria-hidden="true" className="size-5" strokeWidth={1.8} />
            <span className="max-sm:sr-only">Sacola</span>
          </Link>
        </div>
      </div>
      <div className="tc-faixa" aria-hidden="true" />
    </header>
  );
}
