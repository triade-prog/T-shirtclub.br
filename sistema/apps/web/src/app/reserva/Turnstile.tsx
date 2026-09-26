"use client";

// O Turnstile mora em packages/ui (loja e painel); aqui só a chave pública da loja.
import { Turnstile as TurnstileUi } from "@tshirtclub/ui";

export const CHAVE_TURNSTILE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function Turnstile(props: { aoResolver: (token: string | null) => void; versao: number }) {
  return <TurnstileUi chave={CHAVE_TURNSTILE} {...props} />;
}
