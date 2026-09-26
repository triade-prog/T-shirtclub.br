import type { Metadata } from "next";
import { connection } from "next/server";
import { Promocoes } from "./Promocoes";

export const metadata: Metadata = { title: "Promoções" };

// Promoções (telas 14 a 17, regra 28): desconto na peça, compre e economize mais, cupom.
export default async function PaginaPromocoes() {
  await connection();
  return <Promocoes />;
}
