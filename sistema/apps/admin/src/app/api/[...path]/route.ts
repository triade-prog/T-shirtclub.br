// Repasse /api → Edge Function api-admin (G1). A sessão do painel é um cookie de primeira parte.
import { criarRepasse, opcoesPainel } from "@tshirtclub/servidor/repasse";

export const dynamic = "force-dynamic";

const repassar = criarRepasse(() => opcoesPainel(process.env));

export { repassar as GET, repassar as POST, repassar as PUT, repassar as PATCH, repassar as DELETE };
