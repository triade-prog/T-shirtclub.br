import { describe, expect, it } from "vitest";
import { envelopeSentry, semDadosPessoais } from "./monitor.ts";

describe("monitoramento sem dados pessoais", () => {
  it("tira telefone, e-mail, CPF, CEP, IP, token e chave do link", () => {
    const texto = semDadosPessoais(
      "falhou para +5577998128809 e (77) 99812-8809, marina@exemplo.com, 123.456.789-09, 45000-000, 200.1.2.3, " +
        "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc, __Host-sessao=abc123, chave aB3dE5fG7hJ9kL1mN3pQ5r",
    );
    expect(texto).toBe("falhou para [telefone] e [telefone], [email], [cpf], [cep], [ip], [token], [cookie], chave [chave]");
  });

  it("mantém o que ajuda a achar o erro", () => {
    expect(semDadosPessoais("TS161: reserva 1048 já decidida em 2026-10-10")).toBe("TS161: reserva 1048 já decidida em 2026-10-10");
    expect(semDadosPessoais("id 6f1c2d3e-4b5a-4c6d-8e7f-000000000001")).toBe("id 6f1c2d3e-4b5a-4c6d-8e7f-000000000001");
  });

  it("monta o envelope do Sentry só com a mensagem limpa e o padrão da rota", () => {
    const envio = envelopeSentry("https://abc123@o1.ingest.sentry.io/42", {
      funcao: "api-public", ambiente: "producao", erro: new Error("telefone +5577998128809 falhou"),
      rota: "/v1/reservations/:id", metodo: "POST", agora: new Date("2026-10-10T12:00:00Z"), id: "00000000-0000-4000-8000-000000000001",
    })!;
    expect(envio.url).toBe("https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc123&sentry_version=7");
    const [, item, evento] = envio.corpo.split("\n").map((l) => JSON.parse(l));
    expect(item.type).toBe("event");
    expect(evento.exception.values[0].value).toBe("telefone [telefone] falhou");
    expect(evento.tags).toEqual({ funcao: "api-public", rota: "/v1/reservations/:id", metodo: "POST" });
    expect(JSON.stringify(evento)).not.toContain("998128809");
    expect(envelopeSentry("não é um dsn", { funcao: "x", ambiente: "y", erro: "z" })).toBeNull();
  });
});
