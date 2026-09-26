import type { Metadata } from "next";
import { connection } from "next/server";
import { Entrar } from "./Entrar";

// Login do painel (tela 9, D12, G7): e-mail e senha, depois o código do autenticador; no
// primeiro acesso, cadastra o autenticador. Gerada a cada pedido (nonce da CSP).

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaEntrar() {
  await connection();
  return <Entrar />;
}
