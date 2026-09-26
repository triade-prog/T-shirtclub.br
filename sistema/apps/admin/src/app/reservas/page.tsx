import type { Metadata } from "next";
import { connection } from "next/server";
import { Reservas } from "./Reservas";

export const metadata: Metadata = { title: "Reservas" };

// Busca de reservas (tela 7, F10): número, telefone ou nome, filtro por estado, 20 por página.
export default async function PaginaReservas() {
  await connection();
  return <Reservas />;
}
