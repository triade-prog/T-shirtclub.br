import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DetalheReserva } from "./DetalheReserva";

export const metadata: Metadata = { title: "Reserva" };

// Detalhe da reserva (tela 7, F7, F8, F10): cliente, peças, pagamentos, entrega e frete,
// cancelamento e a linha do tempo.
export default async function PaginaReserva({ params }: PageProps<"/reservas/[id]">) {
  await connection();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <DetalheReserva id={id} />;
}
