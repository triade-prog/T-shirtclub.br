// Avatar de quem usa o painel (0630): as iniciais do nome numa cor tirada do próprio nome, a
// mesma no topo do painel e na Equipe de Minha conta.

/** "Ana Paula" → "AP"; "Carol" → "C". */
export const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

const TONS = ["pink", "lemon", "lav", "blue", "green"] as const;

/** A cor do avatar: sempre a mesma para o mesmo nome. */
export const tomDoNome = (nome: string) => TONS[[...nome].reduce((s, c) => s + c.charCodeAt(0), 0) % TONS.length];
