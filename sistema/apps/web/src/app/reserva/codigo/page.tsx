import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PassoCodigo } from "./PassoCodigo";

// Reserva, passo 2 de 3: a cliente pede o código pelo próprio WhatsApp (verificação
// invertida) e digita aqui (tela 6 do design, rota /reserva/codigo, F3). A tentativa só
// abre neste navegador (cookie __Host-tentativa, G12).

export const metadata: Metadata = { title: "Confirme seu WhatsApp", robots: { index: false } };

export default async function PaginaCodigo({ searchParams }: PageProps<"/reserva/codigo">) {
  const { t } = await searchParams;
  if (typeof t !== "string" || !/^[0-9a-f-]{36}$/.test(t)) redirect("/reserva");
  return <PassoCodigo tentativaId={t} numeroLoja={process.env.WHATSAPP_LOJA ?? "5577998155772"} />;
}
