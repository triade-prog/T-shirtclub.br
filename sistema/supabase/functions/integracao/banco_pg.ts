// Banco direto no Postgres, só para os testes de integração: chama as mesmas funções SQL
// que o PostgREST chama em produção, com os argumentos pelo nome.

import postgres from "postgres";
import { ErroBanco, type Banco } from "../_shared/banco.ts";

export function bancoPg(url: string): Banco & { sql: postgres.Sql; fechar(): Promise<void> } {
  const sql = postgres(url, { max: 60, onnotice: () => {} });
  const assinaturas = new Map<string, { args: Map<string, string>; retorno: string }>();

  async function assinatura(funcao: string) {
    const salva = assinaturas.get(funcao);
    if (salva) return salva;
    const [linha] = await sql<{ nomes: string[] | null; tipos: string[]; retorno: string }[]>`
      select to_jsonb(proargnames) as nomes, to_jsonb(proargtypes::regtype[]::text[]) as tipos, prorettype::regtype::text as retorno
        from pg_proc where proname = ${funcao} and pronamespace = 'public'::regnamespace`;
    if (!linha) throw new ErroBanco("42883", `função ${funcao} não existe`);
    const nova = { args: new Map((linha.nomes ?? []).map((n, i) => [n, linha.tipos[i]!])), retorno: linha.retorno };
    assinaturas.set(funcao, nova);
    return nova;
  }

  // O driver serializa cada valor pelo tipo do parâmetro (JSON, listas, booleanos).
  function valor(v: unknown): unknown {
    return v === undefined ? null : v;
  }

  return {
    sql,
    fechar: () => sql.end(),
    async rpc<T>(funcao: string, args: Record<string, unknown> = {}): Promise<T> {
      if (!/^[a-z_][a-z0-9_]*$/.test(funcao)) throw new Error("Nome de função inválido");
      const a = await assinatura(funcao);
      const nomes = Object.keys(args);
      const partes = nomes.map((n, i) => `${n} => $${i + 1}::${a.args.get(n) ?? "text"}`);
      const valores = nomes.map((n) => valor(args[n])) as postgres.ParameterOrJSON<never>[];
      const chamada = `${funcao}(${partes.join(", ")})`;
      try {
        if (a.retorno === "void") {
          await sql.unsafe(`select ${chamada}`, valores);
          return null as T;
        }
        const [linha] = await sql.unsafe(`select to_jsonb(${chamada}) as r`, valores);
        return (linha?.r ?? null) as T;
      } catch (e) {
        const erro = e as { code?: string; message?: string };
        if (erro.code) throw new ErroBanco(erro.code, erro.message ?? "");
        throw e;
      }
    },
  };
}
