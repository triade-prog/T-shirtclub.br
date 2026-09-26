// Repasse /api → Edge Function api-public (G1). Sem regra de negócio aqui.
import { COOKIES_LOJA } from "@tshirtclub/domain";
import { criarRepasse } from "@tshirtclub/servidor/repasse";

export const dynamic = "force-dynamic";

const repassar = criarRepasse(() => ({
  destino: `${process.env.SUPABASE_FUNCTIONS_URL ?? ""}/api-public`,
  segredo: process.env.REPASSE_SEGREDO ?? "",
  cookies: Object.values(COOKIES_LOJA),
}));

export { repassar as GET, repassar as POST, repassar as PUT, repassar as PATCH, repassar as DELETE };
