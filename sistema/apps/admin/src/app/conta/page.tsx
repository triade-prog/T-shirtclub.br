import type { Metadata } from "next";
import { connection } from "next/server";
import { Conta } from "./Conta";

export const metadata: Metadata = { title: "Minha conta" };

// Minha conta (tela 22): senha, aparelhos conectados e autenticadores (D12).
export default async function PaginaConta() {
  await connection();
  return <Conta />;
}
