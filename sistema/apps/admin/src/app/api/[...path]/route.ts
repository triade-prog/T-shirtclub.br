// Repasse /api → Edge Function api-admin (G1). A sessão do painel é um cookie de primeira parte.
import { criarRepasse } from "@tshirtclub/servidor/repasse";

export const dynamic = "force-dynamic";

const repassar = criarRepasse(() => ({
  destino: `${process.env.SUPABASE_FUNCTIONS_URL ?? ""}/api-admin`,
  segredo: process.env.REPASSE_SEGREDO ?? "",
  cookies: ["__Host-painel"],
}));

export { repassar as GET, repassar as POST, repassar as PUT, repassar as PATCH, repassar as DELETE };
