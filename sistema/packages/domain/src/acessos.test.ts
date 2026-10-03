import { describe, expect, it } from "vitest";
import { aparelhoDoNavegador, caminhoDaVisita, ehRobo, origemDaVisita, visitaSchema } from "./acessos.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const TABLET = "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

describe("acessos (0520)", () => {
  it("só os endereços da loja contam; o número da reserva some", () => {
    expect(caminhoDaVisita("/")).toBe("/");
    expect(caminhoDaVisita("/colecao/estate-italiana/")).toBe("/colecao/estate-italiana");
    expect(caminhoDaVisita("/produto/limone-amalfi?cor=1#topo")).toBe("/produto/limone-amalfi");
    expect(caminhoDaVisita("/reserva/1048")).toBe("/reserva/numero");
    expect(caminhoDaVisita("/sacola")).toBe("/sacola");
    for (const fora of ["/admin", "/colecao/<script>", "/colecao/A", "/api/v1/visita", "/../etc", "/wp-login.php", `/produto/${"a".repeat(120)}`]) {
      expect(caminhoDaVisita(fora)).toBeNull();
    }
  });

  it("origem: utm, redes conhecidas, direto, outros e a própria loja (navegação interna)", () => {
    expect(origemDaVisita("")).toBe("direto");
    expect(origemDaVisita("instagram")).toBe("instagram");
    expect(origemDaVisita("https://l.instagram.com/")).toBe("instagram");
    expect(origemDaVisita("https://www.google.com.br/")).toBe("google");
    expect(origemDaVisita("https://lm.facebook.com/l.php")).toBe("facebook");
    expect(origemDaVisita("https://wa.me/")).toBe("whatsapp");
    expect(origemDaVisita("https://t.co/abc")).toBe("x");
    expect(origemDaVisita("https://blogdamoda.com.br/post")).toBe("outros");
    expect(origemDaVisita("https://tshirtclub.vercel.app/colecao/fe", "tshirtclub.vercel.app")).toBeNull();
    expect(origemDaVisita("http://[bad")).toBe("outros");
  });

  it("aparelho pelo navegador", () => {
    expect([IPHONE, ANDROID, TABLET, IPAD, MAC].map(aparelhoDoNavegador)).toEqual(["mobile", "mobile", "tablet", "tablet", "desktop"]);
  });

  it("robôs, prévias de link e ferramentas não contam", () => {
    expect(ehRobo(IPHONE)).toBe(false);
    expect(ehRobo(MAC)).toBe(false);
    for (const robo of [null, "", "curl/8.4", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/129.0 Safari/537.36"]) {
      expect(ehRobo(robo)).toBe(true);
    }
  });

  it("corpo da visita com limite de tamanho", () => {
    expect(visitaSchema.safeParse({ caminho: "/", origem: "" }).success).toBe(true);
    expect(visitaSchema.safeParse({ caminho: "/".repeat(301) }).success).toBe(false);
  });
});
