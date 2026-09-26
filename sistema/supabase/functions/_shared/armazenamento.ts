// Supabase Storage (bucket público "catalogo"): o painel envia a foto já em WebP direto ao
// Storage, pela URL assinada; a Vercel não recebe o arquivo (seção 04, product_images).

export interface EnvioAssinado {
  /** URL para o PUT do arquivo, válida por 2 h. */
  url: string;
  token: string;
}

export interface Armazenamento {
  urlDeEnvio(caminho: string): Promise<EnvioAssinado>;
  apagar(caminhos: string[]): Promise<void>;
}

export function storageSupabase(url: string, chaveServico: string, bucket = "catalogo", buscar: typeof fetch = fetch): Armazenamento {
  const headers = { apikey: chaveServico, authorization: `Bearer ${chaveServico}`, "content-type": "application/json" };
  return {
    async urlDeEnvio(caminho) {
      const r = await buscar(`${url}/storage/v1/object/upload/sign/${bucket}/${caminho}`, {
        method: "POST",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`Storage respondeu ${r.status}`);
      const { url: relativa } = (await r.json()) as { url: string };
      const completa = new URL(`${url}/storage/v1${relativa}`);
      return { url: completa.toString(), token: completa.searchParams.get("token") ?? "" };
    },
    async apagar(caminhos) {
      if (caminhos.length === 0) return;
      const r = await buscar(`${url}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ prefixes: caminhos }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`Storage respondeu ${r.status}`);
    },
  };
}
