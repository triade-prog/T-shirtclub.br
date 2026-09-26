import type { Metadata } from "next";
import { connection } from "next/server";
import { Estoque } from "./Estoque";

export const metadata: Metadata = { title: "Estoque" };

// Estoque (tela 11, F2.3): o que tem, o que está reservado e vendido, e o ajuste com motivo.
export default async function PaginaEstoque() {
  await connection();
  return <Estoque />;
}
