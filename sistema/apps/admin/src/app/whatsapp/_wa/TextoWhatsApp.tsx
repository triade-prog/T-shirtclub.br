import { SITE_LOJA, preencherResposta } from "@tshirtclub/domain";

// Texto do WhatsApp na tela como sai no celular (0570): *negrito*, _itálico_ e ~riscado~, com as
// quebras de linha (white-space na classe .wa-texto). {site}, {endereco} e {horario} viram os
// dados da loja como a Clubinha manda; sem os dados na tela, um aviso entre colchetes no lugar.

export interface DadosLoja { endereco?: string | null; horario?: string | null }

const MARCA = /(^|[\s(“"])([*_~])([^\s*_~](?:[^*_~\n]*?[^\s*_~])?)\2(?=$|[\s.,!?:;)”"])/g;

function formatar(texto: string): React.ReactNode[] {
  const partes: React.ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(MARCA)) {
    const inicio = m.index + m[1]!.length;
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio));
    const [, , marca, conteudo] = m;
    partes.push(marca === "*" ? <b key={inicio}>{conteudo}</b> : marca === "_" ? <i key={inicio}>{conteudo}</i> : <s key={inicio}>{conteudo}</s>);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

export function comDadosDaLoja(texto: string, loja?: DadosLoja): string {
  if (loja) return preencherResposta(texto, { site: SITE_LOJA, ...loja });
  return texto.replaceAll("{site}", SITE_LOJA).replaceAll("{endereco}", "[endereço da loja]").replaceAll("{horario}", "[horário da loja]");
}

export function TextoWhatsApp({ texto, loja, className }: { texto: string; loja?: DadosLoja; className?: string }) {
  return <p className={`wa-texto${className ? ` ${className}` : ""}`}>{formatar(comDadosDaLoja(texto, loja))}</p>;
}
