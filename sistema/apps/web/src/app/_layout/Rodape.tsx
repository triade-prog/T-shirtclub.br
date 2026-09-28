import Link from "next/link";
import { ArrowUp, Bike, CreditCard, MessageCircle, Package, Store, Tag, type LucideIcon } from "lucide-react";
import { condicaoBeneficioVip, formatarReais, textoBeneficioVip } from "@tshirtclub/domain";
import { Selo } from "@tshirtclub/ui";
import { buscarCatalogo, buscarOfertaClub, buscarOfertaVip, type Colecao } from "@/lib/catalogo";
import { EMPRESA, redesDaLoja } from "@/lib/empresa";
import { FormVip } from "../_vip/FormVip";
import { IconeRede } from "./IconeRede";

// Rodapé (27/09, referência Le Lis no estilo V4): as vantagens da loja em cartões, a Lista VIP,
// os links (coleções, ajuda, atendimento e redes) e a linha com os dados da empresa. Coleções,
// oferta do Club e cupom VIP vêm do catálogo (cache da loja); sem catálogo, o rodapé segue sem eles.
export async function Rodape() {
  const [colecoes, club, vip] = await Promise.all([
    buscarCatalogo<Colecao[]>("v1/catalog/collections"), buscarOfertaClub(), buscarOfertaVip(),
  ]);
  const numero = process.env.WHATSAPP_LOJA ?? "5577998155772";
  const redes = redesDaLoja(process.env);
  const vantagens: { Icone: LucideIcon; titulo: string; texto: string }[] = [
    { Icone: Tag, titulo: club ? `${club.qtd} por ${formatarReais(club.precoCentavos)}` : "Monte seu Club", texto: "Misture qualquer coleção" },
    { Icone: Store, titulo: "Retire na loja", texto: "Sem frete, com o código do pedido" },
    { Icone: Bike, titulo: "Motoboy", texto: "Na cidade, frete combinado" },
    { Icone: Package, titulo: "Envio", texto: "Para outras cidades" },
    { Icone: CreditCard, titulo: "PIX ou cartão", texto: "Pagamento com segurança" },
    { Icone: MessageCircle, titulo: "WhatsApp", texto: "Atendimento de gente" },
  ];

  return (
    <footer className="mt-16 border-t-4 border-tinta">
      <section aria-label="Vantagens da loja" className="bg-rosa-bruma px-3.5 py-10 md:px-5">
        <ul className="mx-auto m-0 grid max-w-7xl list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {vantagens.map(({ Icone, titulo, texto }, i) => (
            <li key={titulo} className={`grid content-start justify-items-center gap-2 rounded-[22px] border-2 border-tinta bg-papel px-3 pb-5 pt-4 text-center shadow-adesivo-sm ${i % 2 ? "lg:translate-y-4" : ""}`}>
              <span className="grid size-11 place-items-center rounded-full border-[1.5px] border-tinta bg-citrino text-no-citrino">
                <Icone aria-hidden="true" className="size-5" strokeWidth={1.8} />
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.1em]">{titulo}</span>
              <span className="text-xs leading-snug text-tinta-suave">{texto}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rodape-vip" className="border-t-2 border-tinta bg-citrino px-3.5 py-10 text-no-citrino md:px-5">
        <div className="mx-auto grid max-w-7xl items-start gap-7 md:grid-cols-[0.8fr_1.2fr] md:gap-12">
          <div className="grid gap-3">
            <Selo fundo="papel" className="justify-self-start">Lista VIP</Selo>
            <h2 id="rodape-vip" className="tc-titulo m-0 text-[clamp(38px,4.6vw,60px)]">Drops novos <em className="text-tinta">primeiro.</em></h2>
            <p className="m-0 max-w-[42ch] text-sm leading-relaxed">
              {vip
                ? <>Ganhe <b>{textoBeneficioVip(vip)} {condicaoBeneficioVip(vip)}</b> e receba no WhatsApp quando chegar estampa nova.</>
                : "Receba no WhatsApp quando chegar estampa nova, antes de acabar."}
            </p>
          </div>
          <FormVip origem="RODAPE" compacto />
        </div>
      </section>

      <div className="bg-verde-escuro text-no-verde">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-9 px-3.5 pb-10 pt-14 md:grid-cols-[1.3fr_1fr_1fr_1fr] md:px-5">
          <div className="col-span-2 grid content-start gap-4 md:col-span-1">
            <p className="tc-titulo m-0 text-[clamp(38px,4vw,62px)] text-rosa-bruma">T-SHIRT<br />CLUB.</p>
            <p className="m-0 max-w-[33ch] text-[13px] leading-relaxed">
              Uma camiseta não determina o seu estilo. Você determina. Vista, misture, repita.
            </p>
          </div>
          <Coluna titulo="Coleções">
            {(colecoes ?? []).map((c) => <li key={c.id}><Link href={`/colecao/${c.slug}`} className="inline-flex min-h-11 items-center">{c.nome}</Link></li>)}
            <li><Link href="/#monte-club" className="inline-flex min-h-11 items-center">Monte seu Club</Link></li>
          </Coluna>
          <Coluna titulo="Ajuda">
            <li><Link href="/consulta" className="inline-flex min-h-11 items-center">Minhas reservas</Link></li>
            <li><Link href="/sacola" className="inline-flex min-h-11 items-center">Minha sacola</Link></li>
            <li><Link href="/privacidade" className="inline-flex min-h-11 items-center">Privacidade</Link></li>
          </Coluna>
          <Coluna titulo="Atendimento" largo>
            <li>
              <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2">
                <MessageCircle aria-hidden="true" className="size-4.5" strokeWidth={1.8} /> WhatsApp {EMPRESA.whatsapp}
              </a>
            </li>
            {redes.map((r) => (
              <li key={r.rede}>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2">
                  <IconeRede rede={r.rede} /> <span>{r.rede} <span className="opacity-80">@{r.usuario}</span></span>
                </a>
              </li>
            ))}
          </Coluna>
        </div>
        <div className="border-t border-no-verde/20">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-3.5 py-5 text-[11px] leading-relaxed md:px-5">
            <p className="m-0 max-w-[80ch]">
              © 2026 T-shirt Club.br · {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} · {EMPRESA.endereco}. Preços e estoque podem mudar sem aviso.
            </p>
            <a href="#" className="inline-flex min-h-11 items-center gap-1.5 font-bold uppercase tracking-[0.1em]">
              <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} /> Voltar ao topo
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function Coluna({ titulo, largo = false, children }: { titulo: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <nav aria-label={titulo} className={largo ? "col-span-2 md:col-span-1" : undefined}>
      <h2 className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-citrino">{titulo}</h2>
      <ul className="m-0 grid list-none gap-0.5 p-0 text-[13px]">{children}</ul>
    </nav>
  );
}
