"use client";

import { useState } from "react";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { ErroSemWebp, TEXTO_SEM_WEBP, enviarArquivo, paraWebp, urlFoto } from "@/lib/catalogo";

/** Proporção esperada da foto (ex.: 16:9 na capa), para avisar quando a enviada foge dela. */
export interface Proporcao { largura: number; altura: number; texto: string }

/** A foto foge da proporção esperada em mais de 8% (a loja corta o que passa do quadro). */
export function foraDaProporcao(largura: number, altura: number, p: Proporcao): boolean {
  return Math.abs(largura / altura / (p.largura / p.altura) - 1) > 0.08;
}

// Capa de coleção ou foto de look: a api-admin gera o caminho e a URL assinada, e o arquivo
// (convertido para WebP no navegador) vai direto ao Storage. Com a proporção esperada (auditoria de
// 28/09: capas 3:1 saíam cortadas no quadro 16:9), avisa quando a foto foge dela; não impede.
export function EnvioFoto({ destino, caminho, aoEnviar, rotulo, proporcao }: {
  destino: "colecao" | "look"; caminho: string | null; aoEnviar: (caminho: string) => void; rotulo: string; proporcao?: Proporcao;
}) {
  const [estado, setEstado] = useState<string | null>(null);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setEstado("Enviando…");
    try {
      // Capa e capítulos de campanha ocupam a largura toda da loja: até 2400 px (peças: 1600)
      const { blob, largura, altura } = await paraWebp(arquivo, destino === "colecao" ? 2400 : 1600);
      const r = await chamarApi<{ caminho: string; envio: { url: string } }>("v1/admin/uploads", { destino });
      if (!r.ok) return setEstado(mensagemDeErro(r.codigo, r.detalhes));
      if (!(await enviarArquivo(r.dados.envio.url, blob))) return setEstado("Não conseguimos enviar a foto. Tente de novo.");
      aoEnviar(r.dados.caminho);
      setEstado(proporcao && foraDaProporcao(largura, altura, proporcao)
        ? `Foto enviada, mas ela tem ${largura} × ${altura}: fora do ${proporcao.texto}, a loja corta as bordas. O ideal é ${proporcao.largura} × ${proporcao.altura}. Salve para aplicar ou troque a foto.`
        : "Foto enviada. Salve para aplicar.");
    } catch (e) {
      setEstado(e instanceof ErroSemWebp ? TEXTO_SEM_WEBP : "Este arquivo não é uma imagem que o navegador consiga abrir.");
    }
  }

  return (
    <div className="field">
      <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "#625258" }}>{rotulo}</span>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do Storage */}
        {caminho && <img className="thumb" src={urlFoto(caminho)} alt="" />}
        <label className="file">{caminho ? "Trocar foto" : "Escolher foto"}<input type="file" accept="image/*" onChange={escolher} /></label>
      </div>
      {estado && <p className="field-help" role="status">{estado}</p>}
    </div>
  );
}
