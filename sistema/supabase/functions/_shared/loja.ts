// Aviso à loja de que o catálogo mudou (revalidação ao publicar): a api-admin chama o
// POST /revalidar da loja depois de cada gravação do catálogo, e a loja expira o cache na hora.
// O aviso é melhor esforço: se a loja não responder, a gravação do painel não falha e o
// catálogo se atualiza sozinho em até 60 s.

export interface AvisoLoja {
  catalogoMudou(): Promise<void>;
}

export function avisoLojaHttp({ urlLoja, segredo, tempoMs = 3000 }: { urlLoja: string; segredo: string; tempoMs?: number }): AvisoLoja {
  const destino = `${urlLoja.replace(/\/+$/, "")}/revalidar`;
  return {
    async catalogoMudou() {
      try {
        const r = await fetch(destino, {
          method: "POST",
          headers: { "x-revalidar-segredo": segredo, "content-type": "application/json" },
          body: JSON.stringify({ etiquetas: ["catalogo"] }),
          signal: AbortSignal.timeout(tempoMs),
        });
        await r.body?.cancel();
        if (!r.ok) console.warn(JSON.stringify({ aviso: "loja não revalidou o catálogo", status: r.status }));
      } catch (e) {
        console.warn(JSON.stringify({ aviso: "loja não revalidou o catálogo", erro: e instanceof Error ? e.name : "desconhecido" }));
      }
    },
  };
}

/** Sem LOJA_URL ou REVALIDAR_SEGREDO: nada a avisar (o catálogo segue com os 60 s). */
export const avisoLojaDesligado: AvisoLoja = { catalogoMudou: () => Promise.resolve() };
