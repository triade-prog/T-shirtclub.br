import Link from "next/link";
import { MessageCircle, ShieldCheck, Store } from "lucide-react";

const GARANTIAS = [
  { Icone: Store, texto: "Retire na loja ou receba em casa" },
  { Icone: ShieldCheck, texto: "PIX ou cartão, com segurança" },
  { Icone: MessageCircle, texto: "Atendimento no WhatsApp" },
];

// Rodapé V4 (D24): verde da marca com contorno de tinta; o verde é o escuro, que passa 4,5:1
// com o papel e o citrino dos títulos.
export function Rodape() {
  return (
    <footer className="mt-16 border-t-4 border-tinta bg-verde-escuro text-no-verde">
      <div className="mx-auto grid max-w-7xl gap-9 px-3.5 pb-8 pt-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-5">
        <div>
          <p className="tc-titulo m-0 text-[clamp(34px,4vw,62px)] text-rosa-bruma">T-SHIRT<br />CLUB.</p>
          <p className="m-0 mt-4 max-w-[33ch] text-[13px] leading-relaxed">
            Uma camiseta não determina o seu estilo. Você determina. Vista, misture, repita. Você faz o Club.
          </p>
        </div>
        <nav aria-label="Comprar">
          <h2 className="m-0 mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-citrino">Comprar</h2>
          <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
            <li><Link href="/" className="inline-flex min-h-11 items-center">Novidades</Link></li>
            <li><Link href="/#monte-club" className="inline-flex min-h-11 items-center">Monte seu Club</Link></li>
          </ul>
        </nav>
        <nav aria-label="Ajuda">
          <h2 className="m-0 mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-citrino">Ajuda</h2>
          <ul className="m-0 grid list-none gap-1 p-0 text-[13px]">
            <li><Link href="/consulta" className="inline-flex min-h-11 items-center">Minhas reservas</Link></li>
            <li><Link href="/privacidade" className="inline-flex min-h-11 items-center">Privacidade</Link></li>
          </ul>
        </nav>
      </div>
      <ul className="mx-auto m-0 grid max-w-7xl list-none grid-cols-3 gap-2 px-3.5 pb-6 text-center text-xs leading-snug md:px-5">
        {GARANTIAS.map(({ Icone, texto }) => (
          <li key={texto} className="grid justify-items-center gap-1.5">
            <Icone aria-hidden="true" className="size-5.5" strokeWidth={1.8} />
            {texto}
          </li>
        ))}
      </ul>
      <div className="border-t border-no-verde/20">
        <p className="mx-auto m-0 flex max-w-7xl flex-wrap justify-between gap-3 px-3.5 py-5 text-[11px] uppercase tracking-[0.1em] md:px-5">
          <span>© 2026 T-shirt Club.br</span>
          <span>Você faz o Club.</span>
        </p>
      </div>
    </footer>
  );
}
