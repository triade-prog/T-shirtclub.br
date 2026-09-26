import type { Metadata } from "next";
import { connection } from "next/server";
import { Catalogo } from "./Catalogo";

export const metadata: Metadata = { title: "Catálogo" };

// Catálogo (tela 10, F2.5): produtos, coleções com cor aprovada, looks e a página inicial.
export default async function PaginaCatalogo() {
  await connection();
  return <Catalogo />;
}
