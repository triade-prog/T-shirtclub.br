import Image from "next/image";
import Link from "next/link";
import { ArrowUp, Bike, CreditCard, MessageCircle, Package, Store, type LucideIcon } from "lucide-react";
import { condicaoBeneficioVip, textoBeneficioVip } from "@tshirtclub/domain";
import { Selo } from "@tshirtclub/ui";
import { buscarCatalogo, buscarOfertaVip, type Colecao } from "@/lib/catalogo";
import { EMPRESA, redesDaLoja } from "@/lib/empresa";
import { FormVip } from "../_vip/FormVip";
import { IconeRede } from "./IconeRede";
import { RodapeTroca } from "./RodapeTroca";

// Rodapé (27/09, referência Le Lis no estilo V4): as vantagens da loja em cartões, a Lista VIP,
// os links (coleções, ajuda, atendimento e redes) e a linha com os dados da empresa. Coleções,
// cupom VIP vêm do catálogo (cache da loja); sem catálogo, o rodapé segue sem eles.
// Na página de uma coleção (28/09), um rodapé curto na cor dela, sem as vantagens e a Lista VIP;
// na sacola (29/09), o rodapé verde sem as vantagens e a Lista VIP.
// As vantagens não repetem o "3 por R$ 119,99" (29/09, pedido da loja): a oferta já está no topo e na
// faixa corrida; são cinco cartões, e o último ocupa a linha inteira no celular.
export async function Rodape() {
  const [colecoes, vip] = await Promise.all([buscarCatalogo<Colecao[]>("v1/catalog/collections"), buscarOfertaVip()]);
  const numero = process.env.WHATSAPP_LOJA ?? "5577998155772";
  const redes = redesDaLoja(process.env);
  const vantagens: { Icone: LucideIcon; titulo: string; texto: string }[] = [
    { Icone: Store, titulo: "Retire na loja", texto: "Sem frete, com o código do pedido" },
    { Icone: Bike, titulo: "Motoboy", texto: "Na cidade, frete combinado" },
    { Icone: Package, titulo: "Envio", texto: "Para outras cidades" },
    { Icone: CreditCard, titulo: "PIX ou cartão", texto: "Pagamento com segurança" },
    { Icone: MessageCircle, titulo: "WhatsApp", texto: "Atendimento de gente" },
  ];

  const empresa = `© 2026 T-shirt Club.br · ${EMPRESA.razaoSocial} · CNPJ ${EMPRESA.cnpj} · ${EMPRESA.endereco}. Preços e estoque podem mudar sem aviso.`;

  const extras = (
    <>
      <section aria-label="Vantagens da loja" className="bg-rosa-bruma px-3.5 py-6 md:px-5">
        <ul className="mx-auto m-0 grid max-w-7xl list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-5">
          {vantagens.map(({ Icone, titulo, texto }) => (
            <li key={titulo} className="grid content-start justify-items-center gap-1.5 rounded-[18px] max-sm:last:col-span-2 border-2 border-tinta bg-papel px-3 py-3 text-center shadow-adesivo-sm">
              <span className="grid size-9 place-items-center rounded-full border-[1.5px] border-tinta bg-citrino text-no-citrino">
                <Icone aria-hidden="true" className="size-4.5" strokeWidth={1.8} />
              </span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.1em]">{titulo}</span>
              <span className="text-xs leading-snug text-tinta-suave">{texto}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="rodape-vip" className="border-t-2 border-tinta bg-citrino px-3.5 py-7 text-no-citrino md:px-5">
        <div className="mx-auto grid max-w-7xl items-start gap-5 md:grid-cols-[0.8fr_1.2fr] md:gap-12">
          <div className="grid gap-3">
            <Selo fundo="papel" className="justify-self-start">Lista VIP</Selo>
            <h2 id="rodape-vip" className="tc-titulo m-0 text-[clamp(32px,3.6vw,48px)]">Drops novos <em className="text-tinta">primeiro.</em></h2>
            <p className="m-0 max-w-[42ch] text-sm leading-relaxed">
              {vip
                ? <>Ganhe <b>{textoBeneficioVip(vip)} {condicaoBeneficioVip(vip)}</b> e receba no WhatsApp quando chegar estampa nova.</>
                : "Receba no WhatsApp quando chegar estampa nova, antes de acabar."}
            </p>
          </div>
          <FormVip origem="RODAPE" compacto />
        </div>
      </section>
    </>
  );

  const links = (
    <div className="bg-verde-escuro text-no-verde">
      {/* Rodapé enxuto (28/09): o logo no lugar do nome escrito, links mais juntos (o alvo de 44 px
          vem do tc-alvo, sem aumentar a altura da linha) e as coleções em duas colunas */}
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-7 px-3.5 pb-8 pt-9 md:grid-cols-[1fr_1.5fr_0.9fr_1fr] md:gap-y-0 md:px-5">
        <div className="col-span-2 grid content-start gap-3 md:col-span-1">
          <Link href="/" aria-label="T-shirt Club.br" className="justify-self-start rounded-campo">
            <Image src="/marca/logo-limao.webp" alt="" width={160} height={108} className="h-14 w-auto md:h-16" />
          </Link>
          <p className="m-0 max-w-[30ch] text-[13px] leading-relaxed">
            Uma camiseta não determina o seu estilo. Você determina. Vista, misture, repita.
          </p>
        </div>
        <Coluna titulo="Coleções" duasColunas>
          {(colecoes ?? []).map((c) => <li key={c.id}><Link href={`/colecao/${c.slug}`} className="tc-alvo relative inline-flex min-h-7 items-center">{c.nome}</Link></li>)}
          <li><Link href="/#monte-club" className="tc-alvo relative inline-flex min-h-7 items-center">Monte seu Club</Link></li>
        </Coluna>
        <Coluna titulo="Ajuda">
          <li><Link href="/consulta" className="tc-alvo relative inline-flex min-h-7 items-center">Minhas reservas</Link></li>
          <li><Link href="/sacola" className="tc-alvo relative inline-flex min-h-7 items-center">Minha sacola</Link></li>
          <li><Link href="/trocas" className="tc-alvo relative inline-flex min-h-7 items-center">Trocas e devoluções</Link></li>
          <li><Link href="/privacidade" className="tc-alvo relative inline-flex min-h-7 items-center">Privacidade</Link></li>
        </Coluna>
        <Coluna titulo="Atendimento" largo>
          <li>
            <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer" className="tc-alvo relative inline-flex min-h-7 items-center gap-2">
              <MessageCircle aria-hidden="true" className="size-4.5" strokeWidth={1.8} /> WhatsApp {EMPRESA.whatsapp}
            </a>
          </li>
          {redes.map((r) => (
            <li key={r.rede}>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="tc-alvo relative inline-flex min-h-7 items-center gap-2">
                <IconeRede rede={r.rede} /> <span>{r.rede} <span className="opacity-80">@{r.usuario}</span></span>
              </a>
            </li>
          ))}
        </Coluna>
      </div>
      <div className="border-t border-no-verde/20">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3.5 py-3 text-[11px] leading-relaxed md:px-5">
          <p className="m-0 max-w-[80ch]">{empresa}</p>
          <a href="#" className="tc-alvo relative inline-flex min-h-7 items-center gap-1.5 font-bold uppercase tracking-[0.1em]">
            <ArrowUp aria-hidden="true" className="size-4" strokeWidth={2} /> Voltar ao topo
          </a>
        </div>
      </div>
    </div>
  );
  const completo = <footer className="mt-12 border-t-4 border-tinta">{extras}{links}</footer>;
  // Na sacola (29/09), só os links e os dados da empresa: as vantagens e a Lista VIP tiravam a
  // atenção de quem está fechando o pedido
  const semExtras = <footer className="mt-12 border-t-4 border-tinta">{links}</footer>;

  // Na página de uma coleção, o rodapé curto na cor dela; na sacola, sem as vantagens e a Lista
  // VIP (RodapeTroca decide no navegador)
  return (
    <RodapeTroca completo={completo} semExtras={semExtras} numero={numero} whatsapp={EMPRESA.whatsapp} empresa={empresa}
      colecoes={(colecoes ?? []).map((c) => ({ slug: c.slug, nome: c.nome, cor: c.cor, paleta: c.paleta, campanhaLigada: Boolean(c.campanha && c.campanhaAtiva) }))} />
  );
}

function Coluna({ titulo, largo = false, duasColunas = false, children }: { titulo: string; largo?: boolean; duasColunas?: boolean; children: React.ReactNode }) {
  return (
    <nav aria-label={titulo} className={largo || duasColunas ? "col-span-2 md:col-span-1" : undefined}>
      <h2 className="m-0 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-citrino">{titulo}</h2>
      <ul className={`m-0 grid list-none gap-y-1.5 p-0 text-[13px]${duasColunas ? " grid-cols-2 gap-x-6" : ""}`}>{children}</ul>
    </nav>
  );
}
