import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Vitrine } from "@tshirtclub/ui";

export const metadata = { title: "Componentes", robots: { index: false, follow: false } };

// Só em desenvolvimento e no CI (MOSTRAR_COMPONENTES=1); em produção não existe.
export default async function Componentes() {
  await connection();
  if (process.env.NODE_ENV === "production" && process.env.MOSTRAR_COMPONENTES !== "1") notFound();
  return <Vitrine app="painel" />;
}
