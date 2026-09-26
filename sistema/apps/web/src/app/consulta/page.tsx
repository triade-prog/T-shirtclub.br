import type { Metadata } from "next";
import { connection } from "next/server";
import { Consulta } from "./Consulta";

// Consulta com código (F9, G13; protótipo 05): a cliente pede o código pelo próprio WhatsApp
// e vê as reservas do número. Gerada a cada pedido: os scripts precisam do nonce da CSP.

export const metadata: Metadata = { title: "Minhas reservas", robots: { index: false } };

export default async function PaginaConsulta() {
  await connection();
  return <Consulta />;
}
