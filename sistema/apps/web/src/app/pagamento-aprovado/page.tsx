import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { destinoCompra, idAnuncios } from "@/lib/anuncios";
import { ReservaAtiva } from "../reserva/[numero]/ReservaAtiva";

// Pagamento aprovado (tráfego pago): endereço fixo para a conversão do Google Ads. A reserva
// abre aqui uma vez, com carregamento completo da página, quando o pagamento é aprovado; o
// conteúdo é o mesmo da reserva paga (escolher a entrega). Sem reserva paga, volta para ela.

export const metadata: Metadata = { title: "Pagamento aprovado", robots: { index: false } };

export default async function PaginaPagamentoAprovado({ searchParams }: PageProps<"/pagamento-aprovado">) {
  const { reserva } = await searchParams;
  // Visita sem reserva não vira página (nem conversão): vai para o início
  if (typeof reserva !== "string" || !/^\d{1,9}$/.test(reserva)) redirect("/");
  const id = idAnuncios(process.env.GOOGLE_ADS_ID);
  const destino = id ? destinoCompra(id, process.env.GOOGLE_ADS_ROTULO_COMPRA) : null;
  return (
    <ReservaAtiva numero={Number(reserva)} numeroLoja={process.env.WHATSAPP_LOJA ?? "5577998155772"}
      aprovado={{ conversao: id ? { id, destino } : null }} />
  );
}
