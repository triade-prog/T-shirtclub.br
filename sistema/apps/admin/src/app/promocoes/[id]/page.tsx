import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EditarPromocao } from "./EditarPromocao";

export const metadata: Metadata = { title: "Promoção" };

export default async function PaginaPromocao({ params, searchParams }: PageProps<"/promocoes/[id]">) {
  await connection();
  const { id } = await params;
  const { tipo } = await searchParams;
  if (id !== "nova" && !/^[0-9a-f-]{36}$/.test(id)) notFound();
  const tipoNovo = tipo === "COMPRE_MAIS" || tipo === "CUPOM" ? tipo : "DESCONTO_PRODUTO";
  return <EditarPromocao id={id === "nova" ? null : id} tipoNovo={tipoNovo} />;
}
