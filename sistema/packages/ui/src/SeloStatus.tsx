import { Selo, type FundoSelo } from "./Selo.tsx";

/** Os estados da reserva que a cliente vê, mais "Encerrada" (link com os detalhes já vencidos). */
export type StatusSelo = "RESERVADO" | "PAGAMENTO_CONFIRMADO" | "ENTREGUE" | "EXPIRADO" | "ENCERRADO";

const SELO: Record<StatusSelo, { rotulo: string; fundo: FundoSelo }> = {
  RESERVADO: { rotulo: "Reservado", fundo: "citrino" },
  PAGAMENTO_CONFIRMADO: { rotulo: "Pago", fundo: "rosa" },
  ENTREGUE: { rotulo: "Entregue", fundo: "rosa" },
  EXPIRADO: { rotulo: "Expirado", fundo: "papel" },
  ENCERRADO: { rotulo: "Encerrada", fundo: "papel" },
};

export interface SeloStatusProps {
  status: StatusSelo;
  /** O brilho da marca; por padrão, só na reserva ativa (momento positivo). */
  brilho?: boolean;
  className?: string;
}

/** Selo do estado da reserva, com o mesmo rótulo e a mesma cor em todas as telas da loja. */
export function SeloStatus({ status, brilho = status === "RESERVADO", className }: SeloStatusProps) {
  const { rotulo, fundo } = SELO[status];
  return <Selo fundo={fundo} brilho={brilho} className={className}>{rotulo}</Selo>;
}
