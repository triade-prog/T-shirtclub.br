// Vitrine interna de componentes (/_componentes): todos os tokens e estados num lugar só.
// É ela que a comparação visual do CI fotografa (F1.13).
import { Aviso } from "./Aviso.tsx";
import { Botao } from "./Botao.tsx";
import { Campo } from "./Campo.tsx";

const CORES = [
  ["papel", "Fundo"], ["algodao", "Áreas recuadas"], ["tinta", "Texto"], ["tinta-suave", "Texto secundário"],
  ["rosa", "Ação principal"], ["rosa-bruma", "Destaque da marca"], ["verde", "Feito"], ["verde-broto", "Fundo de ok"],
  ["ok", "Ok"], ["aviso", "Atenção"], ["erro", "Erro"], ["info", "Informação"],
] as const;

const COLECOES = [["tomate", "Tomate"], ["limao", "Limão"], ["mediterraneo", "Mediterrâneo"], ["lavanda", "Lavanda"], ["menta", "Menta"]] as const;

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t border-linha py-8">
      <h2 className="m-0 text-2xl font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

export function Vitrine({ app }: { app: "loja" | "painel" }) {
  return (
    <div className="mx-auto grid max-w-5xl px-4 pb-16">
      <header className="grid gap-2 py-8">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.16em] text-tinta-suave">Uso interno · {app}</p>
        <h1 className="m-0 font-display text-5xl font-extrabold leading-none">Componentes</h1>
        <p className="m-0 text-tinta-suave">Tokens e estados do design system (packages/ui).</p>
      </header>

      <Secao titulo="Cores">
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 p-0">
          {CORES.map(([token, uso]) => (
            <li key={token} className="overflow-hidden rounded-campo border border-linha bg-branco text-sm">
              <span className="block h-12 border-b border-linha" style={{ background: `var(--tc-${token})` }} />
              <span className="grid px-3 py-2"><strong className="font-semibold">{token}</strong>{uso}</span>
            </li>
          ))}
        </ul>
        {app === "loja" && (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {COLECOES.map(([classe, nome]) => (
              <li key={classe} className={`col-${classe} inline-flex items-center gap-2 rounded-pilula border border-linha bg-branco px-3.5 py-2 text-sm font-medium`}>
                <span aria-hidden="true" className="size-2.5 rounded-full bg-colecao" />{nome}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Tipografia">
        <p className="m-0 font-display text-[46px] font-extrabold leading-[0.92]">Welcome to the Club.</p>
        <p className="m-0 text-2xl font-semibold tracking-tight">Título de seção em Poppins</p>
        <p className="m-0 max-w-prose">Texto corrido em Poppins 400, com linhas confortáveis para ler no celular.</p>
        <p className="m-0 text-sm text-tinta-suave">Nota e texto secundário.</p>
      </Secao>

      <Secao titulo="Botões">
        <div className="grid max-w-sm gap-3">
          <Botao>Adicionar ao Club</Botao>
          <Botao variante="escuro">Escolher a terceira</Botao>
          <Botao variante="contorno">Todas as peças</Botao>
          <Botao disabled>Escolha uma peça</Botao>
          <Botao carregando>Gerando PIX…</Botao>
          <Botao variante="link" className="justify-self-start">Pedir cancelamento</Botao>
        </div>
      </Secao>

      <Secao titulo="Campos">
        <div className="grid max-w-sm gap-4">
          <Campo rotulo="Nome" autoComplete="name" defaultValue="Marina Souza" />
          <Campo rotulo="WhatsApp" type="tel" defaultValue="(77) 9981" erro="Confira o número: use DDD + celular com 9 dígitos." />
          <Campo rotulo="Cupom (opcional)" ajuda="Vale só a promoção mais vantajosa." />
        </div>
      </Secao>

      <Secao titulo="Avisos">
        <div className="grid max-w-md gap-3">
          <Aviso tipo="marca" titulo="Ainda não está reservado.">No próximo passo você confirma seu WhatsApp.</Aviso>
          <Aviso tipo="ok" titulo="Pagamento confirmado!">Pedido #1048 pago no PIX.</Aviso>
          <Aviso tipo="atencao" titulo="Faltam 5 minutos.">A reserva fica guardada até 14:32.</Aviso>
          <Aviso tipo="erro" titulo="Limone Amalfi Coast acabou agora.">Tire da sacola para continuar.</Aviso>
          <Aviso tipo="info" titulo="Nada fica guardado ainda." />
        </div>
      </Secao>
    </div>
  );
}
