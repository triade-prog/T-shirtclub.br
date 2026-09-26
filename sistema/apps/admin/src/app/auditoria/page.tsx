import type { Metadata } from "next";
import { connection } from "next/server";
import { Auditoria } from "./Auditoria";

export const metadata: Metadata = { title: "Auditoria" };

// Auditoria (tela 21): o registro permanente, com filtros por autor, assunto e período.
export default async function PaginaAuditoria() {
  await connection();
  return <Auditoria />;
}
