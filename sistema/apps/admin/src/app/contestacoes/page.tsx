import type { Metadata } from "next";
import { connection } from "next/server";
import { Contestacoes } from "./Contestacoes";

export const metadata: Metadata = { title: "Contestações" };

// Estornos e contestações de pagamentos já confirmados (G2): registrar como a loja resolveu.
export default async function PaginaContestacoes() {
  await connection();
  return <Contestacoes />;
}
