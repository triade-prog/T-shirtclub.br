"use client";

import Link from "next/link";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { formatarReais, linkWhatsApp, type CodigoErro } from "@tshirtclub/domain";
import { Aviso, Botao, Campo, cx } from "@tshirtclub/ui";
import { chamarApi, horario, mensagemDeErro } from "@/lib/api";
import { BlocoCartao } from "./BlocoCartao";
import { BlocoPix } from "./BlocoPix";
import { VerificarWhatsApp } from "./VerificarWhatsApp";
import { ENTREGA, guardado, type Logistica, type Modalidade, type Reserva } from "./util";

// Depois do pagamento (regra 17, F8; tela 8 do design e protótipo 19): escolher retirada,
// motoboy ou envio, frete calculado pela loja e pago em até 2 h, e o andamento até a entrega.

const AJUDA_MODALIDADE: Record<Modalidade, string> = {
  RETIRADA: "Sem frete. Retire na loja com o código do pedido.",
  MOTOBOY: "Frete calculado pela loja.",
  ENVIO: "Frete calculado pela loja · Correios ou transportadora.",
};
// Com o frete pago ou o pedido a caminho, a entrega não muda mais pela tela (DELIVERY_LOCKED).
const PODE_TROCAR = new Set(["AGUARDANDO_MODALIDADE", "AGUARDANDO_CALCULO_FRETE", "AGUARDANDO_PAGAMENTO_FRETE"]);

export function Entrega({ reserva, numeroLoja, aoMudar }: { reserva: Reserva; numeroLoja: string; aoMudar: () => void }) {
  const log = reserva.logistica ?? {};
  const entregue = reserva.status === "ENTREGUE";
  const sub = log.substatus ?? "AGUARDANDO_MODALIDADE";
  const [trocando, setTrocando] = useState(false);
  const escolher = !entregue && (sub === "AGUARDANDO_MODALIDADE" || trocando);
  const freteCentavos = log.frete?.status === "PAGO" || log.frete?.pagoEm ? log.frete.valorCentavos : 0;

  return (
    <section className="mx-auto grid w-full max-w-xl gap-5 px-3.5 pb-12 pt-8 md:pt-12">
      <span className="-rotate-2 justify-self-start rounded-selo border-2 border-tinta bg-verde-broto px-3 py-1.5 font-display text-lg font-extrabold text-verde-escuro shadow-adesivo-sm">
        {entregue ? "Entregue!" : "Pago!"}
      </span>
      <h1 className="m-0 font-display text-[34px] font-extrabold leading-[0.95] tracking-[-0.04em]">
        {entregue ? "Pedido entregue." : "Suas peças são suas."}
      </h1>
      <p className="m-0 text-tinta-suave">
        Pedido #{reserva.numero} · {formatarReais(reserva.totalCentavos + freteCentavos)}
        {freteCentavos > 0 ? " com o frete" : ""}.
        {entregue ? " Obrigada pela compra! Trocas e devoluções são combinadas pelo WhatsApp." : sub === "AGUARDANDO_MODALIDADE" ? " Agora falta só escolher como receber." : ""}
      </p>

      <Passos reserva={reserva} />

      {escolher ? (
        <FormEntrega reserva={reserva} aoSalvar={() => { setTrocando(false); aoMudar(); }} aoCancelar={trocando ? () => setTrocando(false) : undefined} />
      ) : (
        <Situacao reserva={reserva} log={log} numeroLoja={numeroLoja} aoMudar={aoMudar} />
      )}

      {!escolher && !entregue && PODE_TROCAR.has(sub) && (
        <Botao variante="link" className="justify-self-start" onClick={() => setTrocando(true)}>Trocar a entrega</Botao>
      )}

      {entregue && (
        <Link href="/" className="inline-flex min-h-13 items-center justify-center rounded-pilula border-2 border-tinta bg-rosa px-6 text-[15px] font-bold text-no-rosa shadow-adesivo">
          Ver novidades na loja
        </Link>
      )}
    </section>
  );
}

function Passos({ reserva }: { reserva: Reserva }) {
  const log = reserva.logistica ?? {};
  const sub = log.substatus ?? "AGUARDANDO_MODALIDADE";
  // O passo de agora: 1 escolher (e o frete), 2 em preparação, 3 a caminho; entregue, todos feitos.
  const agora = reserva.status === "ENTREGUE" ? 5
    : ["PRONTO_PARA_RETIRADA", "SAIU_PARA_ENTREGA", "ENVIADO"].includes(sub) ? 3
    : sub === "EM_PREPARACAO" ? 2 : 1;
  const aCaminho = log.modalidade === "RETIRADA" ? "Pronto para retirar" : log.modalidade === "ENVIO" ? "Enviado" : "Saiu para entrega";
  const passos = ["Pago", "Escolher a entrega", "Em preparação", aCaminho, "Entregue"];
  return (
    <ol className="m-0 grid list-none gap-3 p-0">
      {passos.map((texto, i) => {
        const estado = i < agora ? "feito" : i === agora ? "agora" : "depois";
        return (
          <li key={texto} className="flex items-center gap-3" aria-current={estado === "agora" ? "step" : undefined}>
            <span aria-hidden="true" className={cx(
              "grid size-9 place-items-center rounded-full border-2 border-tinta font-display text-sm font-extrabold",
              estado === "feito" ? "bg-rosa text-no-rosa" : estado === "agora" ? "bg-citrino text-no-citrino" : "bg-papel text-tinta-suave",
            )}>{estado === "feito" ? "✓" : i + 1}</span>
            <span className={cx(estado === "agora" && "font-bold", estado === "depois" && "text-tinta-suave")}>
              {texto}<span className="sr-only">{estado === "feito" ? ": feito" : estado === "agora" ? ": agora" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Caixa({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="grid gap-2 rounded-[22px] border-2 border-tinta bg-papel p-5 shadow-[6px_6px_0_var(--tc-citrino)]">
      <h2 className="m-0 font-editorial text-2xl font-bold tracking-[-0.035em]">{titulo}</h2>
      {children}
    </div>
  );
}

function FormEntrega({ reserva, aoSalvar, aoCancelar }: { reserva: Reserva; aoSalvar: () => void; aoCancelar?: () => void }) {
  const atual = reserva.logistica?.modalidade ?? reserva.entrega ?? "RETIRADA";
  const [modalidade, setModalidade] = useState<Modalidade>(atual);
  const [erro, setErro] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [precisaCodigo, setPrecisaCodigo] = useState(false);
  const [pendente, setPendente] = useState<unknown>(null);

  async function enviar(corpo: unknown) {
    setSalvando(true);
    setErro(null);
    const r = await chamarApi(`v1/reservations/${reserva.id}/fulfillment`, corpo, "PUT");
    setSalvando(false);
    if (r.ok) return aoSalvar();
    if (r.codigo === "PHONE_VERIFICATION_REQUIRED") {
      setPendente(corpo);
      return setPrecisaCodigo(true);
    }
    setErro(mensagemDeErro(r.codigo as CodigoErro, r.detalhes));
  }

  function aoEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (modalidade === "RETIRADA") return void enviar({ modalidade });
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const endereco = { cep: v("cep"), rua: v("rua"), numero: v("numero"), complemento: v("complemento") || undefined, bairro: v("bairro"), cidade: v("cidade"), uf: v("uf").toUpperCase() };
    const novos: Record<string, string> = {};
    if (endereco.cep.replace(/\D/g, "").length !== 8) novos.cep = "Confira o CEP: são 8 números.";
    for (const k of ["rua", "numero", "bairro", "cidade"] as const) if (!endereco[k]) novos[k] = "Preencha este campo.";
    if (!/^[A-Z]{2}$/.test(endereco.uf)) novos.uf = "Use a sigla do estado, como BA.";
    setErros(novos);
    if (Object.keys(novos).length === 0) void enviar({ modalidade, endereco });
  }

  if (precisaCodigo) {
    return <VerificarWhatsApp reservaId={reserva.id} aoVerificar={() => { setPrecisaCodigo(false); void enviar(pendente); }} />;
  }

  return (
    <form
      onSubmit={aoEnviar}
      // O erro de um campo some quando a cliente mexe nele (G19: erro junto do campo, sem ficar velho).
      onChange={(e) => {
        const alvo = e.target as unknown as HTMLInputElement;
        const nome = alvo.name;
        if (erros[nome]) setErros(({ [nome]: _, ...resto }) => resto);
      }}
      noValidate
      className="grid gap-4 rounded-[22px] border-2 border-tinta bg-papel p-5 shadow-[6px_6px_0_var(--tc-citrino)]">
      <h2 className="m-0 font-editorial text-2xl font-bold tracking-[-0.035em]">Como você quer receber?</h2>
      {erro && <div role="alert"><Aviso tipo="atencao" titulo={erro} /></div>}
      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="sr-only">Forma de entrega</legend>
        {(Object.keys(ENTREGA) as Modalidade[]).map((m) => (
          <label key={m} className="grid min-h-12 cursor-pointer grid-cols-[auto_1fr] items-center gap-x-3 rounded-campo border-2 border-tinta bg-branco px-4 py-2.5 shadow-adesivo-sm has-checked:bg-rosa-bruma">
            <input type="radio" name="modalidade" value={m} checked={modalidade === m} onChange={() => setModalidade(m)} className="row-span-2 size-5 accent-rosa" />
            <span className="text-[15px] font-semibold">{ENTREGA[m]}</span>
            <span className="text-sm text-tinta-suave">{AJUDA_MODALIDADE[m]}</span>
          </label>
        ))}
      </fieldset>

      {modalidade !== "RETIRADA" && (
        <div className="grid gap-3">
          <p className="m-0 text-sm text-tinta-suave">Guardamos o endereço só para esta entrega, por até 90 dias depois dela.</p>
          <Campo name="cep" rotulo="CEP" inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="00000-000" erro={erros.cep} />
          <Campo name="rua" rotulo="Rua" autoComplete="address-line1" maxLength={120} erro={erros.rua} />
          <div className="grid grid-cols-[1fr_1.4fr] gap-3">
            <Campo name="numero" rotulo="Número" maxLength={20} erro={erros.numero} />
            <Campo name="complemento" rotulo="Complemento (opcional)" autoComplete="address-line2" maxLength={60} />
          </div>
          <Campo name="bairro" rotulo="Bairro" maxLength={80} erro={erros.bairro} />
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <Campo name="cidade" rotulo="Cidade" autoComplete="address-level2" maxLength={80} erro={erros.cidade} />
            <Campo name="uf" rotulo="UF" autoComplete="address-level1" maxLength={2} className="uppercase" erro={erros.uf} />
          </div>
        </div>
      )}

      <Botao type="submit" cheio carregando={salvando}>{modalidade === "RETIRADA" ? "Confirmar retirada" : "Enviar endereço"}</Botao>
      {aoCancelar && <Botao variante="link" className="justify-self-start" onClick={aoCancelar}>Manter como está</Botao>}
    </form>
  );
}

function Situacao({ reserva, log, numeroLoja, aoMudar }: { reserva: Reserva; log: Logistica; numeroLoja: string; aoMudar: () => void }) {
  const falarComLoja = linkWhatsApp(numeroLoja, `Oi! Sobre o pedido #${reserva.numero}`);
  const lugar = log.endereco ? [log.endereco.rua && `${log.endereco.rua}, ${log.endereco.numero ?? ""}`, log.endereco.bairro, log.endereco.cidade && `${log.endereco.cidade}/${log.endereco.uf ?? ""}`].filter(Boolean).join(" · ") : null;
  if (reserva.status === "ENTREGUE") return null;
  switch (log.substatus) {
    case "AGUARDANDO_CALCULO_FRETE":
      return (
        <Caixa titulo="A loja está calculando o frete.">
          <p className="m-0 text-[15px]">{ENTREGA[log.modalidade ?? "MOTOBOY"]}{lugar ? ` · ${lugar}` : ""}.</p>
          <p className="m-0 text-sm text-tinta-suave">Você recebe o valor no WhatsApp e paga por aqui, em até 2 horas depois do cálculo.</p>
        </Caixa>
      );
    case "AGUARDANDO_PAGAMENTO_FRETE":
      return log.frete ? (
        <>
          <Caixa titulo={`Frete: ${formatarReais(log.frete.valorCentavos)}`}>
            <p className="m-0 text-[15px]">
              {ENTREGA[log.modalidade ?? "MOTOBOY"]}{log.frete.prazoDias !== undefined ? ` · chega em até ${log.frete.prazoDias} ${log.frete.prazoDias === 1 ? "dia útil" : "dias úteis"}` : ""}.
            </p>
            {log.frete.observacao && <p className="m-0 text-sm text-tinta-suave">{log.frete.observacao}</p>}
            {log.frete.pagarAte && <p className="m-0 text-sm font-bold">Pague até {horario(log.frete.pagarAte)}.</p>}
          </Caixa>
          <PagarFrete
            reservaId={reserva.id}
            valorCentavos={log.frete.valorCentavos}
            podePagar={!log.frete.pagarAte || Date.parse(log.frete.pagarAte) > Date.parse(reserva.agora)}
            aoAprovar={aoMudar}
          />
        </>
      ) : null;
    case "FRETE_VENCIDO":
      return (
        <Caixa titulo="O prazo para pagar o frete venceu.">
          <p className="m-0 text-[15px]">Suas peças continuam pagas. Fale com a loja para combinar a entrega.</p>
          <a href={falarComLoja} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 justify-self-start font-bold underline decoration-rosa decoration-2 underline-offset-2">
            <MessageCircle aria-hidden="true" className="size-5" strokeWidth={1.8} /> Falar com a loja no WhatsApp
          </a>
        </Caixa>
      );
    case "PRONTO_PARA_RETIRADA":
      return (
        <Caixa titulo="Pronto para retirada!">
          <p className="m-0 text-[15px]">Mostre este código na loja:</p>
          {log.codigoRetirada && <p className="m-0 font-display text-[34px] font-extrabold tracking-[0.08em]">{log.codigoRetirada}</p>}
        </Caixa>
      );
    case "SAIU_PARA_ENTREGA":
      return (
        <Caixa titulo="Saiu para entrega">
          <p className="m-0 text-[15px]">O motoboy está a caminho{log.endereco?.bairro ? ` de ${log.endereco.bairro}` : ""}. Tenha alguém para receber.</p>
        </Caixa>
      );
    case "ENVIADO":
      return (
        <Caixa titulo="Pedido enviado">
          {log.rastreio ? <p className="m-0 text-[15px]">Código de rastreio: <b className="select-all">{log.rastreio}</b></p> : <p className="m-0 text-[15px]">O código de rastreio chega no WhatsApp.</p>}
        </Caixa>
      );
    default:
      return (
        <Caixa titulo="Estamos preparando seu pedido.">
          <p className="m-0 text-[15px]">{ENTREGA[log.modalidade ?? "RETIRADA"]}{lugar ? ` · ${lugar}` : ""}.</p>
          {log.modalidade === "RETIRADA" && log.codigoRetirada && (
            <p className="m-0 text-sm">Código de retirada: <b className="font-display text-lg tracking-[0.08em]">{log.codigoRetirada}</b>. Avisamos no WhatsApp quando estiver pronto.</p>
          )}
        </Caixa>
      );
  }
}

/** O frete vai pela mesma forma dos produtos: a lembrada neste navegador ou a que o servidor indicar. */
function PagarFrete({ reservaId, valorCentavos, podePagar, aoAprovar }: { reservaId: string; valorCentavos: number; podePagar: boolean; aoAprovar: () => void }) {
  const [cartao, setCartao] = useState(() => guardado(`tc-forma-${reservaId}`) === "CARTAO");
  return cartao ? (
    <BlocoCartao reservaId={reservaId} finalidade="FRETE" titulo="Pagar o frete" valorCentavos={valorCentavos} podePagar={podePagar}
      aoAprovar={aoAprovar} aoTravarPix={() => setCartao(false)} />
  ) : (
    <BlocoPix reservaId={reservaId} finalidade="FRETE" titulo="Pagar o frete" valorCentavos={valorCentavos} podeGerar={podePagar}
      aoAprovar={aoAprovar} aoTravarCartao={() => setCartao(true)} />
  );
}
