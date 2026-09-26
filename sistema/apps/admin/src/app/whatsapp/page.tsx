import type { Metadata } from "next";
import { connection } from "next/server";
import { Whatsapp } from "./Whatsapp";

export const metadata: Metadata = { title: "WhatsApp" };

// WhatsApp (tela 18): conexão com o QR code, fila, ritmo, notificações e mensagem de teste.
export default async function PaginaWhatsapp() {
  await connection();
  return <Whatsapp />;
}
