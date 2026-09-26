// Tipos da reserva como a api-public devolve (reservation_json, payment_json).

export type StatusReserva = "RESERVADO" | "PAGAMENTO_CONFIRMADO" | "ENTREGUE" | "EXPIRADO";
export type Modalidade = "RETIRADA" | "MOTOBOY" | "ENVIO";
export type Substatus =
  | "AGUARDANDO_MODALIDADE" | "AGUARDANDO_CALCULO_FRETE" | "AGUARDANDO_PAGAMENTO_FRETE"
  | "FRETE_VENCIDO" | "EM_PREPARACAO" | "PRONTO_PARA_RETIRADA" | "SAIU_PARA_ENTREGA" | "ENVIADO";

export interface Logistica {
  modalidade?: Modalidade;
  substatus?: Substatus;
  confirmadaEm?: string;
  endereco?: { rua?: string; numero?: string; bairro?: string; cidade?: string; uf?: string };
  codigoRetirada?: string;
  rastreio?: string;
  frete?: { valorCentavos: number; prazoDias?: number; observacao?: string; pagarAte?: string; status?: string; pagoEm?: string };
}

export interface Reserva {
  id: string;
  numero: number;
  status: StatusReserva;
  motivoEncerramento?: "PRAZO_ESGOTADO" | "CANCELAMENTO_APROVADO" | null;
  entrega?: Modalidade;
  subtotalCentavos: number;
  descontoCentavos: number;
  totalCentavos: number;
  criadaEm: string;
  expiraEm: string;
  toleranciaAte: string | null;
  expiradaEm?: string | null;
  itens?: { produtoId: string; nome: string; qtd: number; totalCentavos: number }[];
  descontos?: { tipo: string; valorCentavos: number; rotulo: string | null }[];
  cancelamento?: { status: "PENDENTE" | "APROVADA" | "RECUSADA" | "PREJUDICADA" } | null;
  logistica?: Logistica | null;
  agora: string;
  /** Pelo link, 30 dias depois do fim: só número e estado (G6). */
  limitada?: boolean;
}

export interface Pagamento {
  id: string;
  forma: "PIX" | "CARTAO";
  status: "CRIADO" | "PENDENTE" | "APROVADO" | "RECUSADO" | "CANCELADO" | "FALHOU" | "EM_ANALISE" | "ESTORNADO";
  valorCentavos: number;
  pix?: { copiaECola: string; qrBase64?: string | null; expiraEm?: string | null };
}

export const ENTREGA: Record<Modalidade, string> = { RETIRADA: "Retirar na loja", MOTOBOY: "Entrega local (motoboy)", ENVIO: "Envio para outra cidade" };

export { guardado, guardar, useRepetir } from "@/lib/navegador";
