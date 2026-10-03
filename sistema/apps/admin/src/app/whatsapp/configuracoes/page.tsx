import type { Metadata } from "next";
import { connection } from "next/server";
import { Configuracoes } from "../Configuracoes";

export const metadata: Metadata = { title: "Configurações · WhatsApp" };

// WhatsApp, aba Configurações (0570): conexão, avisos para a equipe e teste.
export default async function PaginaConfiguracoes() {
  await connection();
  return <Configuracoes />;
}
