import { describe, expect, it } from "vitest";
import { revalidacaoAutorizada } from "./revalidar";

describe("revalidação ao publicar", () => {
  it("só com o segredo certo", () => {
    expect(revalidacaoAutorizada("s3gredo-longo", "s3gredo-longo")).toBe(true);
    expect(revalidacaoAutorizada("s3gredo", "s3gredo-longo")).toBe(false);
    expect(revalidacaoAutorizada(null, "s3gredo-longo")).toBe(false);
  });

  it("sem o segredo configurado, ninguém revalida", () => {
    expect(revalidacaoAutorizada("", undefined)).toBe(false);
    expect(revalidacaoAutorizada("qualquer", "")).toBe(false);
  });
});
