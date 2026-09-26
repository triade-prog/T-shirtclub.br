import type { Metadata } from "next";
import { connection } from "next/server";
import { Bloqueados } from "./Bloqueados";

export const metadata: Metadata = { title: "Telefones bloqueados" };

// Telefones bloqueados por 3 expirações em 30 dias (tela 08): liberar ou manter, com motivo.
export default async function PaginaBloqueados() {
  await connection();
  return <Bloqueados />;
}
