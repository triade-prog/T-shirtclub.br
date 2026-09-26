// Acesso ao banco pelas funções de domínio (RPC do PostgREST com a chave de serviço). As
// rotas só chamam funções SQL: a regra que não pode falhar fica no banco (seção 05).

export class ErroBanco extends Error {
  constructor(readonly codigo: string, mensagem: string) {
    super(mensagem);
    this.name = "ErroBanco";
  }
}

export interface Banco {
  rpc<T>(funcao: string, args?: Record<string, unknown>): Promise<T>;
}

export function bancoPostgrest(url: string, chaveServico: string, buscar: typeof fetch = fetch): Banco {
  return {
    async rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      if (!/^[a-z_][a-z0-9_]*$/.test(funcao)) throw new Error("Nome de função inválido");
      const r = await buscar(`${url}/rest/v1/rpc/${funcao}`, {
        method: "POST",
        headers: { apikey: chaveServico, authorization: `Bearer ${chaveServico}`, "content-type": "application/json" },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(8000),
      });
      const texto = await r.text();
      const corpo = texto ? JSON.parse(texto) : null;
      if (!r.ok) throw new ErroBanco(String(corpo?.code ?? r.status), String(corpo?.message ?? "erro no banco"));
      return corpo as T;
    },
  };
}
