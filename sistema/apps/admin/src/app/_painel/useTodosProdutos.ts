"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { chamarApi, mensagemDeErro, precisaEntrar } from "@/lib/api";
import type { PaginaProdutos, ProdutoLinha } from "@/lib/tiposCatalogo";

/** Todos os produtos (a lista vem de 20 em 20); mudar `versao` busca de novo. Sem sessão, vai para /entrar. */
export function useTodosProdutos(versao = 0): { produtos: ProdutoLinha[] | null; erro: string | null } {
  const router = useRouter();
  const [estado, setEstado] = useState<{ produtos: ProdutoLinha[] | null; erro: string | null }>({ produtos: null, erro: null });
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const todos: ProdutoLinha[] = [];
      for (let pagina = 1; pagina <= 50; pagina++) {
        const r = await chamarApi<PaginaProdutos>(`v1/admin/products?pagina=${pagina}`);
        if (!r.ok) {
          if (!vivo) return;
          if (precisaEntrar(r.codigo)) return router.replace(`/entrar?voltar=${encodeURIComponent(location.pathname + location.search)}`);
          return setEstado({ produtos: null, erro: mensagemDeErro(r.codigo, r.detalhes) });
        }
        todos.push(...r.dados.itens);
        if (todos.length >= r.dados.total || r.dados.itens.length === 0) break;
      }
      if (vivo) setEstado({ produtos: todos, erro: null });
    })();
    return () => { vivo = false; };
  }, [versao, router]);
  return estado;
}
