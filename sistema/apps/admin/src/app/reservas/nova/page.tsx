import type { Metadata } from "next";
import { connection } from "next/server";
import { NovaReserva } from "./NovaReserva";

export const metadata: Metadata = { title: "Nova reserva" };

// Reserva manual pelo painel (0470): pelo link ou já paga fora do site.
export default async function PaginaNovaReserva() {
  await connection();
  return <NovaReserva />;
}
