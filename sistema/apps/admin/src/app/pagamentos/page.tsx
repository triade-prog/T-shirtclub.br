import type { Metadata } from "next";
import { connection } from "next/server";
import { Pagamentos } from "./Pagamentos";

export const metadata: Metadata = { title: "Pagamentos" };

// Pagamentos (F6.9, tela 12): o histórico de todos os pagamentos e a análise (estornar ou converter em novo pedido, sempre com motivo).
export default async function PaginaPagamentos() {
  await connection();
  return <Pagamentos />;
}
