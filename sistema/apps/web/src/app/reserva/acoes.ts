"use server";

import { cookies } from "next/headers";
import { COOKIE_SACOLA, opcoesApagarSacola } from "@/lib/sacola";

/** Depois da reserva criada, a sacola se esvazia (as peças agora estão na reserva). */
export async function esvaziarSacola(): Promise<void> {
  (await cookies()).set(COOKIE_SACOLA, "", opcoesApagarSacola);
}
