import type { Metadata } from "next";
import { connection } from "next/server";
import { Cancelamentos } from "./Cancelamentos";

export const metadata: Metadata = { title: "Cancelamentos" };

// Pedidos de cancelamento (regra 12, F7.2): pendentes primeiro, decisão com motivo.
export default async function PaginaCancelamentos() {
  await connection();
  return <Cancelamentos />;
}
