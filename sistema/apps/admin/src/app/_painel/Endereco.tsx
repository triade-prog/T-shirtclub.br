"use client";

import { Campo } from "./ui";

// Endereço de entrega no painel (0590): os mesmos campos e regras do site (enderecoSchema e
// address_ok no banco). Usado na Nova reserva (venda já paga com motoboy ou envio) e no quadro
// Entrega da reserva, para a loja preencher ou corrigir.

export interface Endereco { cep: string; rua: string; numero: string; complemento?: string; bairro: string; cidade: string; uf: string }

/** "46400000" → "46400-000" */
export const cepNaTela = (cep: string) => (/^\d{8}$/.test(cep) ? `${cep.slice(0, 5)}-${cep.slice(5)}` : cep);

/** O endereço em duas linhas, como vai na etiqueta. */
export function linhasDoEndereco(e: Endereco): [string, string] {
  return [`${e.rua}, ${e.numero}${e.complemento ? `, ${e.complemento}` : ""}`, `${e.bairro} · ${e.cidade}/${e.uf} · CEP ${cepNaTela(e.cep)}`];
}

export function CamposEndereco({ inicial }: { inicial?: Partial<Endereco> | null }) {
  return (
    <fieldset className="field endereco-campos">
      <legend>Endereço de entrega</legend>
      <div className="form-grid form-grid3">
        <Campo name="cep" rotulo="CEP" inputMode="numeric" autoComplete="off" maxLength={9} placeholder="46400-000" defaultValue={inicial?.cep ? cepNaTela(inicial.cep) : ""} />
        <Campo name="rua" rotulo="Rua" autoComplete="off" maxLength={120} defaultValue={inicial?.rua ?? ""} />
        <Campo name="numero" rotulo="Número" autoComplete="off" maxLength={20} defaultValue={inicial?.numero ?? ""} />
        <Campo name="complemento" rotulo="Complemento (opcional)" autoComplete="off" maxLength={60} defaultValue={inicial?.complemento ?? ""} />
        <Campo name="bairro" rotulo="Bairro" autoComplete="off" maxLength={80} defaultValue={inicial?.bairro ?? ""} />
        <Campo name="cidade" rotulo="Cidade" autoComplete="off" maxLength={80} defaultValue={inicial?.cidade ?? "Caetité"} />
        <Campo name="uf" rotulo="UF" autoComplete="off" maxLength={2} defaultValue={inicial?.uf ?? "BA"} />
      </div>
    </fieldset>
  );
}

/** Lê os campos do formulário: o endereço pronto para a API, ou o que falta. */
export function lerEndereco(f: FormData): { endereco: Endereco } | { erro: string } {
  const v = (n: string) => String(f.get(n) ?? "").trim();
  const cep = v("cep").replace(/\D/g, "");
  const uf = v("uf").toUpperCase();
  if (!/^\d{8}$/.test(cep)) return { erro: "Confira o CEP: são 8 números, como 46400-000." };
  for (const [campo, nome] of [["rua", "a rua"], ["numero", "o número"], ["bairro", "o bairro"], ["cidade", "a cidade"]] as const) {
    if (!v(campo)) return { erro: `Falta ${nome} do endereço.` };
  }
  if (!/^[A-Z]{2}$/.test(uf)) return { erro: "Confira a UF: duas letras, como BA." };
  return { endereco: { cep, rua: v("rua"), numero: v("numero"), complemento: v("complemento") || undefined, bairro: v("bairro"), cidade: v("cidade"), uf } };
}
