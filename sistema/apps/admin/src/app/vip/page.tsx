import type { Metadata } from "next";
import { connection } from "next/server";
import { ListaVip } from "./ListaVip";

export const metadata: Metadata = { title: "Lista VIP" };

// Lista VIP (0390): quem entrou pelo pop-up ou pelo rodapé da loja, com o cupom de boas-vindas.
export default async function PaginaVip() {
  await connection();
  return <ListaVip />;
}
