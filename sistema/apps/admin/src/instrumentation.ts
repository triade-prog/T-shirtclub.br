// Erros do servidor do Next (F11.5): log sem dados pessoais e, com SENTRY_DSN, o Sentry.
import type { Instrumentation } from "next";
import { relatarErroNext } from "@tshirtclub/servidor/monitor";

export const onRequestError: Instrumentation.onRequestError = async (erro, requisicao, contexto) => {
  await relatarErroNext("admin", erro, requisicao.method, { routePath: contexto.routePath, routeType: contexto.routeType }, process.env);
};
