import { Bird, Shirt } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ICONES_STORY, iconeDoStory, rotuloDoIcone } from "./IconeStory.tsx";

describe("ícone do Pick your story (0500)", () => {
  it("usa o ícone escolhido no painel", () => {
    expect(iconeDoStory("pomba")).toBe(Bird);
    expect(rotuloDoIcone("arco_iris")).toBe("Arco-íris");
  });

  it("sem escolha, com chave que saiu da lista ou do protótipo, volta para a camiseta", () => {
    for (const chave of [null, undefined, "", "unicornio", "constructor", "__proto__", "tostring"]) {
      expect(iconeDoStory(chave)).toBe(Shirt);
      expect(rotuloDoIcone(chave)).toBe("Camiseta");
    }
  });

  it("toda chave cabe no formato que o banco e a api-admin aceitam", () => {
    for (const chave of Object.keys(ICONES_STORY)) expect(chave).toMatch(/^[a-z_]{1,30}$/);
  });
});
