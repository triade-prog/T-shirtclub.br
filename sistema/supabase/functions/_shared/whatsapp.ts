// WhatsAppProvider (W1): a Z-API hoje; a API oficial (Cloud API) é o plano B, e a falsa
// serve aos testes. Trocar de ferramenta é trocar a implementação, não o fluxo.

export interface EnvioWhatsApp {
  id: string;
}

export interface WhatsAppProvider {
  /** Telefone em E.164 (+5577…). */
  enviarTexto(telefone: string, texto: string): Promise<EnvioWhatsApp>;
  /** Código com o botão "Copiar código" quando a ferramenta tiver; senão, só o texto. */
  enviarCodigo(telefone: string, texto: string, codigo: string): Promise<EnvioWhatsApp>;
  conectado(): Promise<boolean>;
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
    grupo: boolean;
    /** Status, canal ou lista de transmissão. */
    canal: boolean;
    momento: Date;
  }
  | { tipo: "STATUS"; ids: string[]; status: "ENTREGUE" | "LIDA" }
  | { tipo: "OUTRO" };

// ─── Z-API ───────────────────────────────────────────────────────────────────────────

export interface ConfigZapi {
  instancia: string;
  token: string;
  /** Token de segurança da conta, no cabeçalho Client-Token. */
  clientToken: string;
}

export function whatsappZapi(cfg: ConfigZapi, buscar: typeof fetch = fetch): WhatsAppProvider {
  const base = `https://api.z-api.io/instances/${encodeURIComponent(cfg.instancia)}/token/${encodeURIComponent(cfg.token)}`;
  const headers = { "client-token": cfg.clientToken, "content-type": "application/json" };
  const numero = (telefone: string) => telefone.replace(/\D/g, "");

  async function enviar(caminho: string, corpo: unknown): Promise<EnvioWhatsApp> {
    const r = await buscar(`${base}/${caminho}`, { method: "POST", headers, body: JSON.stringify(corpo), signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`Z-API respondeu ${r.status}`);
    const j = (await r.json()) as { messageId?: string; id?: string; zaapId?: string };
    return { id: String(j.messageId ?? j.id ?? j.zaapId ?? "") };
  }

  return {
    enviarTexto: (telefone, texto) => enviar("send-text", { phone: numero(telefone), message: texto }),
    async enviarCodigo(telefone, texto, codigo) {
      try {
        return await enviar("send-button-otp", { phone: numero(telefone), message: texto, code: codigo, buttonText: "Copiar código" });
      } catch {
        return await enviar("send-text", { phone: numero(telefone), message: texto });
      }
    },
    async conectado() {
      try {
        const r = await buscar(`${base}/status`, { headers, signal: AbortSignal.timeout(5000) });
        return r.ok && (await r.json())?.connected === true;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Lê o corpo do webhook da Z-API. Remetente sem número (LID) vira null: a conferência de
 * como a conta real entrega esse caso fica para quando a loja tiver a conta (E3).
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
    grupo: c.isGroup === true || (typeof c.phone === "string" && c.phone.includes("-group")),
    canal: c.isNewsletter === true || c.broadcast === true || c.isStatusReply === true,
    momento,
  };
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
  };
  return falso;
}
