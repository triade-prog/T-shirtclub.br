import type { Metadata } from "next";
import { connection } from "next/server";
import { Acessos } from "./Acessos";

export const metadata: Metadata = { title: "Acessos" };

// Acessos da loja (0520): visitas, visitantes, páginas, origens e aparelhos, sem cookie.
export default async function PaginaAcessos() {
  await connection();
  return <Acessos />;
}
