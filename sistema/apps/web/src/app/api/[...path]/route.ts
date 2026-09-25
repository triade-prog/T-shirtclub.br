// Repasse /api → Edge Function api-public (G1). Sem regra de negócio aqui.
import { criarRepasse } from "@tshirtclub/servidor/repasse";

export const dynamic = "force-dynamic";

const repassar = criarRepasse(() => ({
  destino: `${process.env.SUPABASE_FUNCTIONS_URL ?? ""}/api-public`,
  segredo: process.env.REPASSE_SEGREDO ?? "",
  cookies: ["__Host-sessao", "__Host-tentativa"],
}));

export { repassar as GET, repassar as POST, repassar as PUT, repassar as PATCH, repassar as DELETE };
