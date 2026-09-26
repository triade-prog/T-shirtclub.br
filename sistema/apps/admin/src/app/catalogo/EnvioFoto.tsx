"use client";

import { useState } from "react";
import { chamarApi, mensagemDeErro } from "@/lib/api";
import { enviarArquivo, paraWebp, urlFoto } from "@/lib/catalogo";

// Capa de coleção ou foto de look: a api-admin gera o caminho e a URL assinada, e o arquivo
// (convertido para WebP no navegador) vai direto ao Storage.
export function EnvioFoto({ destino, caminho, aoEnviar, rotulo }: {
  destino: "colecao" | "look"; caminho: string | null; aoEnviar: (caminho: string) => void; rotulo: string;
}) {
  const [estado, setEstado] = useState<string | null>(null);

  async function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    setEstado("Enviando…");
    try {
      const { blob } = await paraWebp(arquivo);
      const r = await chamarApi<{ caminho: string; envio: { url: string } }>("v1/admin/uploads", { destino });
      if (!r.ok) return setEstado(mensagemDeErro(r.codigo, r.detalhes));
      if (!(await enviarArquivo(r.dados.envio.url, blob))) return setEstado("Não conseguimos enviar a foto. Tente de novo.");
      aoEnviar(r.dados.caminho);
      setEstado("Foto enviada. Salve para aplicar.");
    } catch {
      setEstado("Este arquivo não é uma imagem que o navegador consiga abrir.");
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
