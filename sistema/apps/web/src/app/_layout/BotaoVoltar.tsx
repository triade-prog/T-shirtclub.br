"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Voltar do cabeçalho V4: aparece fora da página inicial. No produto, volta para onde a
// pessoa estava (coleção ou início) quando ela veio da própria loja.
export function BotaoVoltar() {
  const caminho = usePathname();
  if (caminho === "/") return <span aria-hidden="true" />;

  function voltar(e: React.MouseEvent) {
    if (document.referrer.startsWith(location.origin) && history.length > 1) {
      e.preventDefault();
      history.back();
    }
  }

  return (
    <Link href="/" onClick={voltar} aria-label="Voltar" className="grid size-11 place-items-center rounded-full hover:bg-citrino">
      <ArrowLeft aria-hidden="true" className="size-5" strokeWidth={1.8} />
    </Link>
  );
}
