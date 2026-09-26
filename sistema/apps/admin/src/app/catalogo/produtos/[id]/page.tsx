import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Produto } from "./Produto";

export const metadata: Metadata = { title: "Peça" };

// Peça do catálogo (tela 10, D20): dados, fotos (1 a 10) e estoque.
export default async function PaginaProduto({ params }: PageProps<"/catalogo/produtos/[id]">) {
  await connection();
  const { id } = await params;
  if (id !== "novo" && !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <Produto id={id === "novo" ? null : id} />;
}
