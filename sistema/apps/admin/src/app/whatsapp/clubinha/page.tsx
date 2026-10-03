import type { Metadata } from "next";
import { connection } from "next/server";
import { Clubinha } from "../Clubinha";

export const metadata: Metadata = { title: "Clubinha · WhatsApp" };

// WhatsApp, aba Clubinha (0570): menu, respostas, horário de atendimento e a prévia no celular.
export default async function PaginaClubinha() {
  await connection();
  return <Clubinha />;
}
