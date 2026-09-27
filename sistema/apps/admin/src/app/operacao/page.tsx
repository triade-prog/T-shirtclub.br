import type { Metadata } from "next";
import { connection } from "next/server";
import { Operacao } from "./Operacao";

export const metadata: Metadata = { title: "Operação" };

// Operação (Kanban do dia, protótipo 09 da V4): as reservas pelo próximo passo.
export default async function PaginaOperacao() {
  await connection();
  return <Operacao />;
}
