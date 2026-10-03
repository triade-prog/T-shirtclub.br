// WhatsAppProvider (W1): uma ferramenta no formato da Z-API (a Z-API ou a Wafly, que usa as
// mesmas rotas, cabeçalho e avisos); a API oficial (Cloud API) é o plano B, e a falsa serve
// aos testes. Trocar de ferramenta é trocar a implementação, não o fluxo.

import type { Banco } from "./banco.ts";

export interface EnvioWhatsApp {
  id: string;
}

export interface WhatsAppProvider {
  /** Telefone em E.164 (+5577…). */
  enviarTexto(telefone: string, texto: string): Promise<EnvioWhatsApp>;
  /** Código com o botão "Copiar código" quando a ferramenta tiver; senão, só o texto. */
  enviarCodigo(telefone: string, texto: string, codigo: string): Promise<EnvioWhatsApp>;
  conectado(): Promise<boolean>;
  /** QR code para reconectar o número (imagem em data URI); null quando já está conectado. */
  qrCode(): Promise<string | null>;
}

/** Evento do webhook, já sem os detalhes de cada ferramenta. */
export type EventoWhatsApp =
  | {
    tipo: "MENSAGEM";
    id: string;
    /** Só dígitos; null quando o remetente vem como identificador LID (G4). */
    remetente: string | null;
    texto: string;
    deMim: boolean;
    /** Enviada pela API (o próprio sistema), não pela equipe no celular; nem toda ferramenta manda. */
    daApi: boolean;
    grupo: boolean;
    /** Status, canal ou lista de transmissão. */
    canal: boolean;
    momento: Date;
  }
  | { tipo: "STATUS"; ids: string[]; status: "ENTREGUE" | "LIDA" }
  | { tipo: "OUTRO" };

/**
 * Conta ao banco cada conexão vista pelas APIs. Quando ela volta depois de cair, o banco
 * libera na hora as mensagens que esperavam nova tentativa, em vez de deixá-las no intervalo
 * de 1, 5 ou 15 min (27/09). Falha ao registrar não muda a resposta.
 */
export function comRegistroDeConexao(whatsapp: WhatsAppProvider, banco: Banco): WhatsAppProvider {
  return {
    ...whatsapp,
    async conectado() {
      const ok = await whatsapp.conectado();
      try {
        await banco.rpc("whatsapp_connection_seen", { p_connected: ok });
      } catch (e) {
        console.warn(`Conexão do WhatsApp não registrada: ${e instanceof Error ? e.message : e}`);
      }
      return ok;
    },
  };
}

// ─── Formato Z-API (Z-API ou Wafly) ──────────────────────────────────────────────────

export const URL_ZAPI = "https://api.z-api.io";
export const URL_WAFLY = "https://wafly.com.br/api-bridge-whats";

export interface ConfigZapi {
  instancia: string;
  token: string;
  /** Token de segurança da conta, no cabeçalho Client-Token. */
  clientToken: string;
  /** Endereço da ferramenta, antes de /instances; sem ele, a Z-API. */
  url?: string;
}

/**
 * A ferramenta pode ter recebido o pedido (sem resposta a tempo, conexão caída no meio ou 504):
 * repetir sozinho mandaria a mensagem duas vezes, e nenhuma das duas documenta uma chave que
 * evite isso. A fila não tenta de novo (0480); a equipe confere a conversa.
 */
export class EnvioIncerto extends Error {
  override name = "EnvioIncerto";
}

export function whatsappZapi(cfg: ConfigZapi, buscar: typeof fetch = fetch): WhatsAppProvider {
  const raiz = (cfg.url ?? URL_ZAPI).replace(/\/+$/, "");
  // Nome para o log: só o domínio. O resto do endereço leva o token, e a mensagem do erro de
  // rede do Deno traz o endereço inteiro: nunca vai para log, fila ou Sentry.
  const nome = new URL(raiz).hostname;
  const base = `${raiz}/instances/${encodeURIComponent(cfg.instancia)}/token/${encodeURIComponent(cfg.token)}`;
  const headers = { "client-token": cfg.clientToken, "content-type": "application/json" };
  const numero = (telefone: string) => telefone.replace(/\D/g, "");

  async function pedir(caminho: string, init: RequestInit, ms: number): Promise<Response> {
    try {
      return await buscar(`${base}/${caminho}`, { ...init, headers, signal: AbortSignal.timeout(ms) });
    } catch (e) {
      throw new EnvioIncerto(`${nome} sem resposta (${e instanceof Error ? e.name : "erro"})`);
    }
  }

  async function enviar(caminho: string, corpo: unknown): Promise<EnvioWhatsApp> {
    const r = await pedir(caminho, { method: "POST", body: JSON.stringify(corpo) }, 10_000);
    if (r.status === 504) throw new EnvioIncerto(`${nome} respondeu 504`);
    if (!r.ok) throw new Error(`${nome} respondeu ${r.status}`);
    // 2xx é mensagem aceita, mesmo se o corpo não vier legível (repetir duplicaria)
    const j = (await r.json().catch(() => null)) as { messageId?: string; id?: string; zaapId?: string } | null;
    return { id: String(j?.messageId ?? j?.id ?? j?.zaapId ?? "") };
  }

  return {
    enviarTexto: (telefone, texto) => enviar("send-text", { phone: numero(telefone), message: texto }),
    // Texto simples, com o código escrito. O botão "Copiar código" (send-button-otp) era aceito
    // pela Z-API (200) mas o WhatsApp não o entregava em conta não oficial: o site dizia
    // "Código enviado" e nada chegava (27/09).
    enviarCodigo: (telefone, texto) => enviar("send-text", { phone: numero(telefone), message: texto }),
    // O motivo vai para o log: sem ele, token ou Client-Token recusados aparecem só como
    // "desconectado". Nunca a URL nem a mensagem do erro de rede: elas levam o token.
    async conectado() {
      try {
        const r = await pedir("status", {}, 5000);
        if (!r.ok) {
          console.warn(`${nome} /status respondeu ${r.status}: ${(await r.text()).slice(0, 200)}`);
          return false;
        }
        // Z-API: {"connected": true}; Wafly (OpenAPI): {"value": "CONNECTED"}
        const j = (await r.json()) as { connected?: unknown; value?: unknown } | null;
        const ok = j?.connected === true || j?.value === "CONNECTED";
        if (!ok) console.warn(`${nome} sem conexão: ${JSON.stringify(j).slice(0, 200)}`);
        return ok;
      } catch (e) {
        console.warn(e instanceof EnvioIncerto ? `${e.message} em /status` : `${nome} /status falhou: ${e instanceof Error ? e.name : "erro"}`);
        return false;
      }
    },
    // A imagem do QR expira em poucos segundos: a tela pede de novo enquanto espera.
    async qrCode() {
      const r = await pedir("qr-code/image", {}, 10_000);
      if (!r.ok) throw new Error(`${nome} respondeu ${r.status}`);
      const j = (await r.json()) as { value?: string; connected?: boolean };
      return j.connected || !j.value ? null : j.value;
    },
  };
}

/**
 * A ferramenta das Edge Functions, pelos segredos: com WAFLY_INSTANCE, WAFLY_TOKEN e
 * WAFLY_CLIENT_TOKEN, a Wafly; sem nenhum deles, a Z-API (ZAPI_INSTANCIA, ZAPI_TOKEN e
 * ZAPI_CLIENT_TOKEN). Wafly pela metade não sobe: melhor a função parada que a ferramenta errada.
 */
export function whatsappDoAmbiente(ler: (nome: string) => string | undefined, buscar: typeof fetch = fetch): WhatsAppProvider {
  const exigir = (nome: string) => {
    const v = ler(nome)?.trim();
    if (!v) throw new Error(`Falta a variável ${nome}`);
    return v;
  };
  if (["WAFLY_INSTANCE", "WAFLY_TOKEN", "WAFLY_CLIENT_TOKEN"].some((n) => ler(n)?.trim())) {
    return whatsappZapi({
      instancia: exigir("WAFLY_INSTANCE"),
      token: exigir("WAFLY_TOKEN"),
      clientToken: exigir("WAFLY_CLIENT_TOKEN"),
      url: URL_WAFLY,
    }, buscar);
  }
  return whatsappZapi({ instancia: exigir("ZAPI_INSTANCIA"), token: exigir("ZAPI_TOKEN"), clientToken: exigir("ZAPI_CLIENT_TOKEN") }, buscar);
}

/**
 * Lê o corpo do webhook no formato da Z-API. A Wafly usa o mesmo tipo (ReceivedCallback, no node
 * do n8n dela), mas o OpenAPI não descreve os campos: conferir com a conta na troca (E16).
 * Remetente sem número (LID) vira null: a conferência de como a conta real entrega esse caso
 * fica para quando a loja tiver a conta (E3).
 */
export function lerWebhookZapi(corpo: unknown): EventoWhatsApp {
  if (!corpo || typeof corpo !== "object") return { tipo: "OUTRO" };
  const c = corpo as Record<string, unknown>;
  if (c.type === "MessageStatusCallback") {
    const status = c.status === "READ" || c.status === "PLAYED" ? "LIDA" : c.status === "RECEIVED" ? "ENTREGUE" : null;
    const ids = Array.isArray(c.ids) ? c.ids.filter((x): x is string => typeof x === "string") : [];
    return status && ids.length ? { tipo: "STATUS", ids, status } : { tipo: "OUTRO" };
  }
  if (c.type !== "ReceivedCallback" || typeof c.messageId !== "string") return { tipo: "OUTRO" };
  const telefone = typeof c.phone === "string" && /^\d{10,15}$/.test(c.phone) ? c.phone : null;
  const texto = typeof (c.text as { message?: unknown } | undefined)?.message === "string" ? (c.text as { message: string }).message : "";
  const momento = typeof c.momment === "number" ? new Date(c.momment) : new Date(NaN);
  return {
    tipo: "MENSAGEM",
    id: c.messageId,
    remetente: telefone,
    texto,
    deMim: c.fromMe === true,
    daApi: c.fromApi === true,
    grupo: c.isGroup === true || (typeof c.phone === "string" && c.phone.includes("-group")),
    canal: c.isNewsletter === true || c.broadcast === true || c.isStatusReply === true,
    momento,
  };
}

/**
 * Para o log de um aviso que não foi lido como mensagem nem status: o tipo, o status e os
 * nomes dos campos, nunca os valores (que trazem número e texto da cliente). Serve para
 * conferir o formato de uma ferramenta nova, como a Wafly.
 */
export function formaDoAviso(corpo: unknown): { tipo: string | null; status: string | null; campos: string[] } {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { tipo: null, status: null, campos: [] };
  const c = corpo as Record<string, unknown>;
  const curto = (v: unknown) => typeof v === "string" && /^[A-Za-z_]{1,40}$/.test(v) ? v : null;
  return { tipo: curto(c.type), status: curto(c.status), campos: Object.keys(c).slice(0, 40).sort() };
}

// ─── Falso (testes e desenvolvimento local) ──────────────────────────────────────────

export interface WhatsAppFalso extends WhatsAppProvider {
  enviadas: { telefone: string; texto: string; codigo?: string }[];
  online: boolean;
  falharProximo: boolean;
}

export function whatsappFalso(): WhatsAppFalso {
  let n = 0;
  const falso: WhatsAppFalso = {
    enviadas: [],
    online: true,
    falharProximo: false,
    enviarTexto(telefone, texto) {
      if (falso.falharProximo) {
        falso.falharProximo = false;
        return Promise.reject(new Error("falha simulada"));
      }
      falso.enviadas.push({ telefone, texto });
      return Promise.resolve({ id: `falso-${++n}` });
    },
    enviarCodigo(telefone, texto, codigo) {
      falso.enviadas.push({ telefone, texto, codigo });
      return Promise.resolve({ id: `falso-${++n}` });
    },
    conectado: () => Promise.resolve(falso.online),
    qrCode: () => Promise.resolve(falso.online ? null : "data:image/png;base64,UVJGQUxTTw=="),
  };
  return falso;
}
