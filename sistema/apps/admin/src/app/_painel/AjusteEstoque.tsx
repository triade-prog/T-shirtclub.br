"use client";

import { useState } from "react";
import { chamarApi } from "@/lib/api";
import type { Variante } from "@/lib/tiposCatalogo";
import { Botao, Campo, Escolha } from "./ui";
import { useEnvio } from "./useEnvio";

// Ajuste de estoque (F2.3): sempre com motivo, sob o mesmo lock da reserva, por tamanho (0370).
// Tirar abaixo do que já está reservado ou vendido é recusado pelo banco (STOCK_BELOW_COMMITTED).
export function AjusteEstoque({ produtoId, nome, variantes, aoAjustar }: {
  produtoId: string; nome: string; variantes: Pick<Variante, "id" | "rotulo" | "ativa">[]; aoAjustar: (total: number) => void;
}) {
  const [sinal, setSinal] = useState<1 | -1>(1);
  const { ocupado, erro, setErro, enviar } = useEnvio<{ total: number }>((d) => aoAjustar(d.total));

  function ajustar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const qtd = Number(String(f.get("qtd") ?? "").trim());
    const motivo = String(f.get("motivo") ?? "").trim();
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100_000) return setErro("Informe quantas peças (um número inteiro).");
    if (motivo.length < 3) return setErro("Escreva o motivo (fica na auditoria).");
    const varianteId = String(f.get("varianteId") ?? "");
    if (!varianteId) return setErro("Escolha o tamanho.");
    void enviar(chamarApi(`v1/admin/products/${produtoId}/stock-adjustments`, { varianteId, delta: sinal * qtd, motivo, tipo: String(f.get("tipo")) }))
      .then((ok) => { if (ok) form.reset(); });
  }

  return (
    <form className="grid" style={{ gap: 12 }} onSubmit={ajustar} noValidate aria-label={`Ajustar o estoque de ${nome}`}>
      <Escolha name="varianteId" rotulo="Tamanho" defaultValue={(variantes.find((v) => v.ativa) ?? variantes[0])?.id}
        opcoes={variantes.map((v) => [v.id, v.ativa ? v.rotulo : `${v.rotulo} (fora de venda)`] as const)} />
      <Escolha name="tipo" rotulo="Tipo" opcoes={[["ENTRADA", "Entrada de peças"], ["AJUSTE", "Ajuste (contagem, perda)"]]}
        onChange={(e) => setSinal(e.target.value === "ENTRADA" ? 1 : sinal)} />
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 800, color: "#625258", marginBottom: 7 }}>Operação</legend>
        <div className="actions">
          <label className="check"><input type="radio" name="sinal" checked={sinal === 1} onChange={() => setSinal(1)} /> Somar</label>
          <label className="check"><input type="radio" name="sinal" checked={sinal === -1} onChange={() => setSinal(-1)} /> Tirar</label>
        </div>
      </fieldset>
      <Campo name="qtd" rotulo="Quantidade" inputMode="numeric" maxLength={6} placeholder="Ex.: 5" />
      <Campo name="motivo" rotulo="Motivo" maxLength={200} placeholder="Ex.: chegaram 5 do fornecedor" />
      {erro && <p role="alert" className="field-error full">{erro}</p>}
      <div className="actions full"><Botao type="submit" carregando={ocupado}>{sinal === 1 ? "Somar ao estoque" : "Tirar do estoque"}</Botao></div>
    </form>
  );
}
