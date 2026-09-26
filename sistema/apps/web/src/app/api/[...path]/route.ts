// Repasse /api → Edge Function api-public (G1). Sem regra de negócio aqui.
import { criarRepasse, opcoesLoja } from "@tshirtclub/servidor/repasse";

export const dynamic = "force-dynamic";

const repassar = criarRepasse(() => opcoesLoja(process.env));

export { repassar as GET, repassar as POST, repassar as PUT, repassar as PATCH, repassar as DELETE };
