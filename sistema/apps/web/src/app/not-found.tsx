import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false } };

// 404 da loja em português (a do Next é em inglês numa página pt-BR), no estilo da V4.
// Gerada a cada pedido: estática, sairia sem o nonce e a CSP bloquearia os scripts.
export default async function NaoEncontrada() {
  await connection();
  return (
    <section className="grid gap-4 px-4 pb-12 pt-8 md:px-5 md:pt-12">
      <h1 className="tc-titulo m-0 text-[clamp(40px,6vw,64px)]">Não achamos <em>esta página.</em></h1>
      <p className="m-0 max-w-prose text-[15px] text-tinta-suave">
        O endereço pode estar incompleto, ou a peça saiu da loja. As estampas que estão à venda ficam no início.
      </p>
      <Link href="/" className="inline-flex min-h-13 w-fit items-center rounded-pilula border-2 border-tinta bg-rosa px-6 text-[15px] font-bold text-no-rosa shadow-adesivo">
        Ver as estampas
      </Link>
    </section>
  );
}
