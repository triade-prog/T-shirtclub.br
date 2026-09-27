// POST /revalidar: a api-admin avisa que o catálogo mudou (peça, fotos, estoque, coleção,
// look, página inicial ou promoção) e a loja expira o cache do catálogo na hora, em vez de
// esperar os 60 s. Só com o segredo REVALIDAR_SEGREDO; sem ele configurado, a rota não existe.
import { revalidateTag } from "next/cache";
import { ETIQUETA_CATALOGO } from "@/lib/catalogo";
import { revalidacaoAutorizada } from "@/lib/revalidar";

export async function POST(request: Request) {
  const segredo = process.env.REVALIDAR_SEGREDO;
  if (!segredo) return Response.json({ erro: { codigo: "NOT_FOUND" } }, { status: 404 });
  if (!revalidacaoAutorizada(request.headers.get("x-revalidar-segredo"), segredo)) {
    return Response.json({ erro: { codigo: "UNAUTHORIZED" } }, { status: 401 });
  }
  // Expira já: a próxima visita busca o catálogo novo na api-public.
  revalidateTag(ETIQUETA_CATALOGO, { expire: 0 });
  return Response.json({ ok: true, etiquetas: [ETIQUETA_CATALOGO] });
}
