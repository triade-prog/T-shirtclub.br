import type { Metadata } from "next";
import { connection } from "next/server";
import { Envios } from "../Envios";

export const metadata: Metadata = { title: "Envios · WhatsApp" };

// WhatsApp, aba Envios (0570): histórico da fila, Tentar de novo e o ritmo de envio.
export default async function PaginaEnvios() {
  await connection();
  return <Envios />;
}
