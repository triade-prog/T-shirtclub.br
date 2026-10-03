import type { Metadata } from "next";
import { connection } from "next/server";
import { Atendimento } from "./Atendimento";

export const metadata: Metadata = { title: "WhatsApp" };

// WhatsApp em abas (0570): Atendimento é a primeira, com as conversas e os chamados.
export default async function PaginaWhatsapp() {
  await connection();
  return <Atendimento />;
}
