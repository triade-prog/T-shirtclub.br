import Image from "next/image";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";

export function Cabecalho() {
  return (
    <header>
      <p className="bg-tinta px-3 py-1.5 text-center text-[12.5px] font-medium text-papel">
        Monte seu Club: 3 camisetas por R$ 119,99
      </p>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-2 py-1.5">
        <span className="w-11" aria-hidden="true" />
        <Link href="/" className="rounded-campo" aria-label="T-shirt Club.br, página inicial">
          <Image src="/marca/logo.webp" alt="" width={120} height={82} priority className="h-11 w-auto" />
        </Link>
        <Link href="/sacola" className="grid size-11 place-items-center rounded-full" aria-label="Sacola">
          <ShoppingBag aria-hidden="true" className="size-6" strokeWidth={1.8} />
        </Link>
      </div>
    </header>
  );
}
