import type { Metadata } from "next";
import { connection } from "next/server";
import { AbrirLink } from "./AbrirLink";

// Link da reserva (G6): tshirtclub.pt/r#chave. A chave fica no fragmento, que não vai ao
// servidor nem aparece em logs; a página lê no navegador e manda no corpo do POST /v1/r.
// O no-referrer desta rota está em cabecalhosSeguranca.

export const metadata: Metadata = { title: "Sua reserva", robots: { index: false, follow: false } };

export default async function PaginaLink() {
  // Gerada a cada pedido: os scripts precisam do nonce da CSP (página estática não teria).
  await connection();
  return <AbrirLink />;
}
