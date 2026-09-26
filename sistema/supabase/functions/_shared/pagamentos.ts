// PaymentProvider (D3): Mercado Pago hoje, atrás desta interface; a versão falsa serve aos
// testes. O resultado de qualquer chamada vem normalizado para apply_payment_result (0130).

export type StatusPagamento = "APROVADO" | "PENDENTE" | "RECUSADO" | "CANCELADO" | "ESTORNADO" | "CONTESTADO";

export interface ResultadoProvedor {
  providerPaymentId: string;
  status: StatusPagamento;
  statusProvedor: string;
  /** Motivo da recusa, quando houver (ex.: cc_rejected_insufficient_amount). */
  detalhe?: string;
  aprovadoEm: string | null;
  valorCentavos: number;
  moeda: string;
  /** external_reference: o id do nosso pagamento. */
  referencia: string | null;
  conta: string | null;
  pix?: { copiaECola: string; qrBase64: string | null; expiraEm: string | null };
}

export interface NovoPix {
  pagamentoId: string;
  valorCentavos: number;
  descricao: string;
  expiraEm: Date;
}

export interface NovoCartao {
  pagamentoId: string;
  valorCentavos: number;
  descricao: string;
  /** Token do Card Payment Brick: o número do cartão nunca passa pelo servidor. */
  token: string;
  metodo: string;
  emissor?: string | null;
  email: string;
}

export interface PaymentProvider {
  criarPix(p: NovoPix): Promise<ResultadoProvedor>;
  criarCartao(p: NovoCartao): Promise<ResultadoProvedor>;
  consultar(providerPaymentId: string): Promise<ResultadoProvedor>;
  cancelar(providerPaymentId: string): Promise<ResultadoProvedor>;
  estornar(providerPaymentId: string, chaveIdempotencia: string): Promise<void>;
}

/** O corpo que apply_payment_result espera. */
export function paraAplicar(r: ResultadoProvedor) {
  return {
    status: r.status,
    aprovadoEm: r.aprovadoEm,
    valorCentavos: r.valorCentavos,
    moeda: r.moeda,
    referencia: r.referencia,
    conta: r.conta,
    statusProvedor: r.statusProvedor,
  };
}

// ─── Mercado Pago ────────────────────────────────────────────────────────────────────

export interface ConfigMercadoPago {
  accessToken: string;
  /** Endereço do webhook-payments (notification_url). */
  urlWebhook: string;
  /** E-mail do pagador no PIX (o Mercado Pago exige; a loja não coleta o da cliente). */
  emailPix: string;
}

const STATUS_MP: Record<string, StatusPagamento> = {
  approved: "APROVADO",
  authorized: "PENDENTE",
  pending: "PENDENTE",
  in_process: "PENDENTE",
  rejected: "RECUSADO",
  cancelled: "CANCELADO",
  refunded: "ESTORNADO",
  charged_back: "CONTESTADO",
  in_mediation: "CONTESTADO",
};

interface PagamentoMp {
  id: number | string;
  status: string;
  status_detail?: string;
  date_approved?: string | null;
  transaction_amount: number;
  currency_id: string;
  external_reference?: string | null;
  collector_id?: number | string | null;
  date_of_expiration?: string | null;
  point_of_interaction?: { transaction_data?: { qr_code?: string; qr_code_base64?: string } };
}

export function lerPagamentoMp(p: PagamentoMp): ResultadoProvedor {
  const qr = p.point_of_interaction?.transaction_data;
  return {
    providerPaymentId: String(p.id),
    status: STATUS_MP[p.status] ?? "PENDENTE",
    statusProvedor: p.status,
    detalhe: p.status_detail,
    aprovadoEm: p.date_approved ?? null,
    valorCentavos: Math.round(p.transaction_amount * 100),
    moeda: p.currency_id,
    referencia: p.external_reference ?? null,
    conta: p.collector_id == null ? null : String(p.collector_id),
    ...(qr?.qr_code ? { pix: { copiaECola: qr.qr_code, qrBase64: qr.qr_code_base64 ?? null, expiraEm: p.date_of_expiration ?? null } } : {}),
  };
}

/** 2026-10-10T15:30:00.000-03:00 (o formato de data do Mercado Pago, no horário de Brasília). */
function dataMp(d: Date): string {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return `${local.toISOString().slice(0, 23)}-03:00`;
}

export function mercadoPago(cfg: ConfigMercadoPago, buscar: typeof fetch = fetch): PaymentProvider {
  async function chamar(caminho: string, init: { method: string; corpo?: unknown; idempotencia?: string }): Promise<PagamentoMp> {
    const r = await buscar(`https://api.mercadopago.com${caminho}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${cfg.accessToken}`,
        "content-type": "application/json",
        ...(init.idempotencia ? { "x-idempotency-key": init.idempotencia } : {}),
      },
      body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) throw new Error(`Mercado Pago respondeu ${r.status}`);
    return (await r.json()) as PagamentoMp;
  }

  return {
    async criarPix(p) {
      return lerPagamentoMp(await chamar("/v1/payments", {
        method: "POST",
        idempotencia: p.pagamentoId, // 2ª camada: retentativa de rede não duplica a cobrança
        corpo: {
          transaction_amount: p.valorCentavos / 100,
          description: p.descricao,
          payment_method_id: "pix",
          payer: { email: cfg.emailPix },
          external_reference: p.pagamentoId,
          date_of_expiration: dataMp(p.expiraEm),
          notification_url: cfg.urlWebhook,
        },
      }));
    },
    async criarCartao(p) {
      return lerPagamentoMp(await chamar("/v1/payments", {
        method: "POST",
        idempotencia: p.pagamentoId,
        corpo: {
          transaction_amount: p.valorCentavos / 100,
          description: p.descricao,
          token: p.token,
          installments: 1,
          payment_method_id: p.metodo,
          ...(p.emissor ? { issuer_id: p.emissor } : {}),
          payer: { email: p.email },
          binary_mode: true, // aprova ou recusa na hora (R13)
          external_reference: p.pagamentoId,
          notification_url: cfg.urlWebhook,
        },
      }));
    },
    async consultar(id) {
      return lerPagamentoMp(await chamar(`/v1/payments/${encodeURIComponent(id)}`, { method: "GET" }));
    },
    async cancelar(id) {
      return lerPagamentoMp(await chamar(`/v1/payments/${encodeURIComponent(id)}`, { method: "PUT", corpo: { status: "cancelled" } }));
    },
    async estornar(id, chave) {
      await chamar(`/v1/payments/${encodeURIComponent(id)}/refunds`, { method: "POST", corpo: {}, idempotencia: chave });
    },
  };
}

/**
 * x-signature do webhook (G3): "ts=…,v1=…", HMAC-SHA256 do manifesto
 * id:<data.id>;request-id:<x-request-id>;ts:<ts>; com a chave secreta. Recusa ts com mais
 * de 5 min e compara em tempo constante.
 */
export async function assinaturaMpValida(
  cabecalho: string | null,
  requestId: string | null,
  dataId: string,
  segredo: string,
  agora: Date = new Date(),
): Promise<boolean> {
  if (!cabecalho || !segredo) return false;
  const partes = Object.fromEntries(cabecalho.split(",").map((p) => p.trim().split("=") as [string, string]));
  const ts = Number(partes.ts);
  if (!partes.ts || !partes.v1 || !Number.isFinite(ts)) return false;
  const tsMs = ts > 1e12 ? ts : ts * 1000;
  if (Math.abs(agora.getTime() - tsMs) > 5 * 60_000) return false;

  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifesto = `id:${id};${requestId ? `request-id:${requestId};` : ""}ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = [...new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(manifesto)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const recebido = partes.v1.toLowerCase();
  let diff = esperado.length ^ recebido.length;
  for (let i = 0; i < Math.max(esperado.length, recebido.length); i++) diff |= (esperado.charCodeAt(i) || 0) ^ (recebido.charCodeAt(i) || 0);
  return diff === 0;
}

// ─── Falso (testes e desenvolvimento local) ──────────────────────────────────────────

export interface PagamentosFalso extends PaymentProvider {
  pagamentos: Map<string, ResultadoProvedor>;
  /** Simula a cliente pagando (ou o banco recusando) depois. */
  mudar(providerPaymentId: string, status: StatusPagamento, aprovadoEm?: string): void;
  /** O próximo cartão sai com este status (binary_mode). */
  proximoCartao: StatusPagamento;
  falharProximo: boolean;
  conta: string;
}

/** `prefixo` separa os ids quando dois testes dividem o mesmo banco. */
export function pagamentosFalso(prefixo = "mp-falso"): PagamentosFalso {
  let n = 0;
  const falso: PagamentosFalso = {
    pagamentos: new Map(),
    proximoCartao: "APROVADO",
    falharProximo: false,
    conta: "123",
    mudar(id, status, aprovadoEm) {
      const p = falso.pagamentos.get(id)!;
      falso.pagamentos.set(id, { ...p, status, statusProvedor: status.toLowerCase(), aprovadoEm: status === "APROVADO" ? aprovadoEm ?? new Date().toISOString() : p.aprovadoEm });
    },
    criarPix(p) {
      if (falso.falharProximo) {
        falso.falharProximo = false;
        return Promise.reject(new Error("falha simulada"));
      }
      const id = `${prefixo}-${++n}`;
      const r: ResultadoProvedor = {
        providerPaymentId: id, status: "PENDENTE", statusProvedor: "pending", aprovadoEm: null, valorCentavos: p.valorCentavos,
        moeda: "BRL", referencia: p.pagamentoId, conta: falso.conta,
        pix: { copiaECola: `00020126PIXFALSO${n}`, qrBase64: null, expiraEm: p.expiraEm.toISOString() },
      };
      falso.pagamentos.set(id, r);
      return Promise.resolve(r);
    },
    criarCartao(p) {
      const id = `${prefixo}-${++n}`;
      const aprovado = falso.proximoCartao === "APROVADO";
      const r: ResultadoProvedor = {
        providerPaymentId: id, status: falso.proximoCartao, statusProvedor: aprovado ? "approved" : "rejected",
        detalhe: aprovado ? "accredited" : "cc_rejected_insufficient_amount", aprovadoEm: aprovado ? new Date().toISOString() : null,
        valorCentavos: p.valorCentavos, moeda: "BRL", referencia: p.pagamentoId, conta: falso.conta,
      };
      falso.pagamentos.set(id, r);
      return Promise.resolve(r);
    },
    consultar(id) {
      const p = falso.pagamentos.get(id);
      return p ? Promise.resolve(p) : Promise.reject(new Error("pagamento não encontrado"));
    },
    cancelar(id) {
      const p = falso.pagamentos.get(id)!;
      if (p.status === "PENDENTE") falso.mudar(id, "CANCELADO");
      return Promise.resolve(falso.pagamentos.get(id)!);
    },
    estornar(id) {
      falso.mudar(id, "ESTORNADO");
      return Promise.resolve();
    },
  };
  return falso;
}
