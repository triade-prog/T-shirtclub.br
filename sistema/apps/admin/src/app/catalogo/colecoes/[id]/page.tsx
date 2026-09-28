import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PaginaColecao } from "./Colecao";

export const metadata: Metadata = { title: "Coleção" };

// Coleção do catálogo (28/09): formulário e prévia na loja; "nova" abre a página vazia.
export default async function PaginaDaColecao({ params }: PageProps<"/catalogo/colecoes/[id]">) {
  await connection();
  const { id } = await params;
  if (id !== "nova" && !/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <PaginaColecao id={id === "nova" ? null : id} />;
}
