import type { Metadata } from "next";
import { connection } from "next/server";
import { Entregas } from "./Entregas";

export const metadata: Metadata = { title: "Entregas e frete" };

// Pedidos pagos por etapa da entrega (tela 13, F8.5): calcular frete, preparar, entregar.
export default async function PaginaEntregas() {
  await connection();
  return <Entregas />;
}
