import { connection } from "next/server";
import { Inicio } from "./_painel/Inicio";

// Início do painel (tela 6, F10): o que pede ação agora, os números do dia e os alertas.
export default async function InicioPainel() {
  await connection();
  return <Inicio />;
}
