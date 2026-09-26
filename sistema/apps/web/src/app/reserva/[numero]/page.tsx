import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReservaAtiva } from "./ReservaAtiva";

// Reserva ativa e PIX (tela 7 do design), pagamento confirmado (tela 8, parte da reserva) e
// expirada (tela 9), na rota /reserva/[numero] (F4 a F6). Tudo no navegador pelo /api: só
// a sessão da cliente (__Host-sessao) abre a reserva.

export const metadata: Metadata = { title: "Sua reserva", robots: { index: false } };

export default async function PaginaReserva({ params }: PageProps<"/reserva/[numero]">) {
  const { numero } = await params;
  if (!/^\d{1,9}$/.test(numero)) notFound();
  return <ReservaAtiva numero={Number(numero)} />;
}
