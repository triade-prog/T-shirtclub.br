"use client";

import { useId } from "react";

// Peças do painel V4 com as classes das telas de referência (painel-v4.css).

export function Botao({ variante = "dark", carregando, className, children, type = "button", disabled, ...resto }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "dark" | "ghost" | "citron" | "pink" | "danger" | "link"; carregando?: boolean }) {
  return (
    <button type={type} disabled={disabled || carregando} aria-busy={carregando || undefined}
      className={`${variante === "link" ? "btn-link" : `btn btn-${variante}`}${className ? ` ${className}` : ""}`} {...resto}>
      {children}
    </button>
  );
}

export const Seta = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" /></svg>;

export function Campo({ rotulo, ajuda, erro, multilinha, id, className, ...resto }:
  React.InputHTMLAttributes<HTMLInputElement> & { rotulo: string; ajuda?: string; erro?: string; multilinha?: boolean }) {
  const auto = useId();
  const idCampo = id ?? auto;
  const descrito = [erro && `${idCampo}-erro`, ajuda && `${idCampo}-ajuda`].filter(Boolean).join(" ") || undefined;
  const comum = { id: idCampo, "aria-invalid": erro ? true : undefined, "aria-describedby": descrito };
  return (
    <div className="field">
      <label htmlFor={idCampo}>{rotulo}</label>
      {multilinha
        ? <textarea className={`textarea${className ? ` ${className}` : ""}`} {...comum} name={resto.name} maxLength={resto.maxLength} placeholder={resto.placeholder} />
        : <input className={`input${className ? ` ${className}` : ""}`} {...comum} {...resto} />}
      {erro && <p className="field-error" id={`${idCampo}-erro`}>{erro}</p>}
      {ajuda && <span className="field-help" id={`${idCampo}-ajuda`}>{ajuda}</span>}
    </div>
  );
}

export function Aviso({ tipo = "rosa", titulo, tag, children }: { tipo?: "rosa" | "green" | "yellow" | "error"; titulo?: string; tag?: string; children?: React.ReactNode }) {
  return (
    <section className={`notice${tipo === "rosa" ? "" : ` ${tipo}`}`} role={tipo === "error" ? "alert" : undefined}>
      {tag && <span className="club-tag"><span className="dot" />{tag}</span>}
      {titulo && <h2>{titulo}</h2>}
      {children}
    </section>
  );
}

/** Selo de estado (status.reserved/paid/issue/ship/expired). */
export function Selo({ tom, children }: { tom: "reserved" | "paid" | "issue" | "ship" | "expired"; children: React.ReactNode }) {
  return <span className={`status ${tom}`}>{children}</span>;
}

export function tomDoStatus(status: string): "reserved" | "paid" | "issue" | "ship" | "expired" {
  return status === "RESERVADO" ? "reserved" : status === "EXPIRADO" ? "expired" : status === "ENTREGUE" ? "ship" : "paid";
}

export function Carregando({ erro }: { erro?: string | null }) {
  return erro ? <Aviso tipo="error" titulo={erro} /> : <p role="status" className="loading">Carregando…</p>;
}
