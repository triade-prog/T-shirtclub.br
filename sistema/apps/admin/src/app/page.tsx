import { connection } from "next/server";
import { Aviso } from "@tshirtclub/ui";

// O login com e-mail, senha e autenticador chega na F2 (D12).
export default async function InicioPainel() {
  await connection();
  return (
    <section className="grid max-w-xl gap-4 px-4 py-10">
      <h1 className="m-0 text-3xl font-semibold tracking-tight">Painel da loja</h1>
      <Aviso tipo="info" titulo="Em construção.">O acesso com e-mail, senha e autenticador chega na próxima fase.</Aviso>
    </section>
  );
}
