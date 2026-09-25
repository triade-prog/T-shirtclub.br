import { MessageCircle, ShieldCheck, Store } from "lucide-react";

const GARANTIAS = [
  { Icone: Store, texto: "Retire na loja ou receba em casa" },
  { Icone: ShieldCheck, texto: "PIX ou cartão, com segurança" },
  { Icone: MessageCircle, texto: "Atendimento no WhatsApp" },
];

export function Rodape() {
  return (
    <footer className="mt-12">
      <ul className="mx-auto grid max-w-6xl grid-cols-3 gap-2 px-3 py-5 text-center text-xs leading-snug">
        {GARANTIAS.map(({ Icone, texto }) => (
          <li key={texto} className="grid justify-items-center gap-1.5">
            <Icone aria-hidden="true" className="size-5.5" strokeWidth={1.8} />
            {texto}
          </li>
        ))}
      </ul>
      <div className="bg-algodao px-4 py-6 text-[13px] text-tinta-suave">
        <div className="mx-auto grid max-w-6xl gap-1">
          <strong className="text-tinta">T-shirt Club.br</strong>
          <span>Retirada na loja, motoboy ou envio · Troca e cuidados · <a href="/privacidade" className="underline decoration-rosa decoration-2 underline-offset-2">Privacidade</a></span>
        </div>
      </div>
    </footer>
  );
}
