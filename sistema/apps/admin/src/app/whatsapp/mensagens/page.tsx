import type { Metadata } from "next";
import { connection } from "next/server";
import { Mensagens } from "../Mensagens";

export const metadata: Metadata = { title: "Mensagens automáticas · WhatsApp" };

// WhatsApp, aba Mensagens automáticas (0570): as notificações por etapa, com a prévia do texto.
export default async function PaginaMensagens() {
  await connection();
  return <Mensagens />;
}
