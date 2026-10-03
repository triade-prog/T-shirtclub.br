import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { idAnuncios } from "@/lib/anuncios";
import { EMPRESA } from "@/lib/empresa";
import { MudarEscolha } from "../_anuncios/MudarEscolha";

export const metadata: Metadata = { title: "Política de privacidade" };

// Política de privacidade (P15, LGPD), a partir do texto-modelo do protótipo (20-privacidade.html),
// com o que o sistema faz de verdade (sacola em cookie, favoritos só no navegador, prazos de guarda
// da F11). Dados da empresa (E6), encarregado e prazo fiscal informados pela loja em 27/09;
// o texto final passa pela revisão jurídica antes de a P15 fechar.

const ATUALIZADA_EM = "03/10/2026";

export default async function Privacidade() {
  // Gerada a cada pedido, como as outras: estática, sairia sem o nonce da CSP (D29)
  await connection();
  // Com a conta do Google Ads configurada, a política conta os cookies de anúncio (só com aceite)
  const anuncios = idAnuncios(process.env.GOOGLE_ADS_ID) !== null;
  return (
    <article className="mx-auto grid max-w-3xl gap-8 px-4 pb-14 pt-8 md:px-5 md:pt-12">
      <header className="grid gap-3">
        <h1 className="tc-titulo m-0 text-[clamp(40px,6vw,64px)]">Política de <em>privacidade.</em></h1>
        <p className="m-0 text-sm text-tinta-suave">Última atualização: {ATUALIZADA_EM}</p>
      </header>

      <Secao titulo="1. Quem cuida dos seus dados">
        <p>
          A T-shirt Club ({EMPRESA.razaoSocial}, CNPJ {EMPRESA.cnpj}, {EMPRESA.endereco}) é a controladora dos dados
          pessoais tratados neste site, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, LGPD).
        </p>
      </Secao>

      <Secao titulo="2. Quais dados coletamos">
        <ul>
          <li>Nome e número de WhatsApp, informados por você ao fazer uma reserva ou consultar seus pedidos.</li>
          <li>Endereço de entrega, só quando você escolhe motoboy ou envio para outra cidade.</li>
          <li>
            Dados do pagamento: forma, valor, data e identificador da transação. Os dados do cartão são digitados
            direto no ambiente do Mercado Pago; a loja não vê nem guarda o número do cartão.
          </li>
          <li>Mensagens que você envia ao WhatsApp da loja (para pedir o código, consultar sua reserva ou receber as respostas automáticas), o horário em que a equipe respondeu, sem o texto da resposta, e a nota que você der ao atendimento.</li>
          <li>Se você entrar na Lista VIP: o WhatsApp, o nome (se quiser informar) e a data em que aceitou receber as novidades.</li>
          <li>
            Dados técnicos de segurança: o endereço IP, guardado de forma protegida (não legível), para limitar abusos
            como pedidos repetidos de código, e a verificação anti-robô da Cloudflare (Turnstile).
          </li>
          <li>
            Contagem de visitas, sem cookie: a página vista, o site ou o link de onde você chegou (como Instagram ou
            Google) e se o aparelho é celular, tablet ou computador. Para contar cada pessoa uma vez por dia, o sistema
            cria um código embaralhado a partir do endereço IP e do navegador, que muda todo dia e não permite saber quem
            é você. Guardamos só os totais por dia.
          </li>
        </ul>
        <p>Não pedimos CPF, e-mail ou data de nascimento para reservar.</p>
      </Secao>

      <Secao titulo="3. Para que usamos e com qual base legal">
        <ul>
          <li>
            Criar e cumprir sua reserva e seu pedido (confirmar o WhatsApp, guardar as peças, receber o pagamento,
            entregar): execução de contrato (art. 7º, V, da LGPD).
          </li>
          <li>Enviar avisos pelo WhatsApp sobre a sua reserva (código, prazo, pagamento, entrega): execução de contrato.</li>
          <li>
            Acompanhar pelo WhatsApp quem reservou, comprou ou pediu atendimento (as peças de uma reserva que expirou e
            ainda estão à venda, o retorno da equipe e, dias depois da entrega, se você gostou da compra): legítimo
            interesse (art. 7º, IX), e você pode pedir para não receber pelo WhatsApp da loja.
          </li>
          <li>
            Prevenir fraude e abuso, como o bloqueio de telefones com expirações repetidas: legítimo interesse
            (art. 7º, IX).
          </li>
          <li>
            Guardar os registros de vendas exigidos pela legislação fiscal e de consumo: cumprimento de obrigação legal
            (art. 7º, II).
          </li>
          <li>
            Saber quantas pessoas visitam o site e quais páginas interessam mais, para melhorar a loja: legítimo interesse
            (art. 7º, IX), só com totais, sem identificar ninguém.
          </li>
          <li>
            Mandar novidades, drops e ofertas pelo WhatsApp, só para quem entrou na Lista VIP: consentimento (art. 7º, I),
            que você retira quando quiser pedindo pelo WhatsApp da loja.
          </li>
          {anuncios && (
            <li>
              Saber quais anúncios do Google trouxeram visitas e compras, só se você aceitar os cookies de anúncio:
              consentimento (art. 7º, I), que você pode retirar quando quiser (item 7).
            </li>
          )}
        </ul>
        <p>Não enviamos propaganda sem o seu pedido e não vendemos seus dados.</p>
      </Secao>

      <Secao titulo="4. Com quem compartilhamos">
        <ul>
          <li>Mercado Pago: processamento do pagamento.</li>
          <li>
            Wafly: conexão do WhatsApp da loja ao sistema, para receber e enviar as mensagens. As mensagens passam também
            pelo próprio WhatsApp (Meta).
          </li>
          <li>Cloudflare (Turnstile): verificação anti-robô nos formulários.</li>
          <li>
            Hospedagem e banco de dados (Supabase e Vercel): armazenamento seguro do sistema, em servidores de São Paulo
            sempre que o fornecedor oferece.
          </li>
          <li>Motoboy ou transportadora: nome, telefone e endereço, só quando há entrega.</li>
          {anuncios && (
            <li>
              Google (Google Ads), só com o seu aceite: os cookies de anúncio e, quando o pagamento é aprovado, o número
              da reserva e o valor da compra, sem nome nem telefone.
            </li>
          )}
        </ul>
        <p>Alguns desses fornecedores podem guardar dados fora do Brasil, com as garantias previstas na LGPD.</p>
      </Secao>

      <Secao titulo="5. Por quanto tempo guardamos">
        <ul>
          <li>
            Códigos de verificação, sessões, tentativas de reserva não concluídas e dados técnicos de segurança: apagados
            em até 30 dias.
          </li>
          <li>Mensagens que você enviou ao WhatsApp da loja pelo sistema: o texto é apagado em até 90 dias.</li>
          <li>Código diário da contagem de visitas: apagado em até 2 dias. Os totais por dia ficam, porque não identificam ninguém.</li>
          <li>Endereço de entrega: 90 dias depois da entrega; depois fica só a cidade.</li>
          <li>Lista VIP: até você pedir para sair; ao sair, o contato é apagado.</li>
          <li>
            Reservas, pedidos e pagamentos: pelo prazo exigido pela legislação fiscal e de consumo
            ({EMPRESA.prazoFiscal}). Depois, são anonimizados.
          </li>
        </ul>
      </Secao>

      <Secao titulo="6. Seus direitos">
        <p>
          Você pode pedir, a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, anonimização ou
          exclusão do que não for obrigatório guardar, portabilidade, informação sobre com quem compartilhamos e revisão
          de decisões como o bloqueio do telefone (art. 18 da LGPD).
        </p>
        <p>
          Para isso, fale com a loja pelo WhatsApp (77) 99815-5772 ou pelo e-mail {EMPRESA.emailEncarregado}. Encarregado
          pelo tratamento de dados: {EMPRESA.nomeEncarregado}.
        </p>
      </Secao>

      <Secao titulo="7. O que fica no seu aparelho">
        <p>
          O site usa cookies necessários para funcionar: um guarda as peças da sua sacola, e os outros mantêm a sua
          reserva e a sua consulta abertas depois da confirmação pelo WhatsApp. As peças que você marca como favoritas
          ficam só no seu navegador. Se você instalar o site na tela inicial, o aparelho guarda também a parte visual do
          site para abrir mais rápido. A contagem de visitas não usa cookie nem guarda nada no seu aparelho.{" "}
          {anuncios
            ? "Cookies de anúncio do Google só entram se você aceitar no aviso do site; sem o aceite, nada é enviado ao Google. Para mudar a escolha, use o botão abaixo; os cookies já gravados também podem ser apagados nas configurações do navegador."
            : "Não usamos cookies de propaganda nem rastreamento de terceiros."}
        </p>
        {anuncios && <MudarEscolha />}
      </Secao>

      <Secao titulo="8. Segurança">
        <p>
          O acesso aos dados é restrito à equipe da loja, as conexões são criptografadas e códigos e senhas são guardados
          de forma protegida. Mesmo assim, nenhum sistema é totalmente imune; se houver um incidente relevante, avisaremos
          você e a Autoridade Nacional de Proteção de Dados (ANPD).
        </p>
      </Secao>

      <Secao titulo="9. Mudanças nesta política">
        <p>Quando esta política mudar, a data no topo será atualizada. Mudanças importantes serão avisadas no site.</p>
      </Secao>

      <Link href="/" className="inline-flex min-h-11 w-fit items-center rounded-campo px-2 font-semibold underline decoration-rosa decoration-2 underline-offset-2">
        Voltar para a loja
      </Link>
    </article>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 text-[15px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_p]:m-0 [&_ul]:m-0 [&_ul]:grid [&_ul]:gap-2 [&_ul]:p-0">
      <h2 className="m-0 font-editorial text-2xl font-bold tracking-[-0.03em]">{titulo}</h2>
      {children}
    </section>
  );
}
