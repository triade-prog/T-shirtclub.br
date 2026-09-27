import { connection } from "next/server";
import { Dashboard } from "./_painel/Dashboard";

// Dashboard comercial (protótipo 03 da V4, F12): como a loja está vendendo. O que pede ação
// agora fica na Operação (/operacao).
export default async function InicioPainel() {
  await connection();
  return <Dashboard />;
}
