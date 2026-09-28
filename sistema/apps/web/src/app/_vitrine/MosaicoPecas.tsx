import Image from "next/image";
import { Selo, cx } from "@tshirtclub/ui";
import { urlFoto, type Foto } from "@/lib/catalogo";

// Composição com as peças reais (0400), no lugar da foto de campanha que a coleção ou o início
// ainda não têm: até 3 fotos com o contorno escuro e a sombra rosa da V4, a primeira maior. A
// altura vem de quem usa (className); sem foto, não desenha nada e o layout se ajusta.
export function MosaicoPecas({ fotos, selo, prioridade, tamanhos, className }: {
  fotos: readonly Foto[];
  /** Adesivo citrino no canto (a oferta do Club). */
  selo?: string;
  prioridade?: boolean;
  /** `sizes` da coluna inteira; cada foto usa a parte dela. */
  tamanhos: string;
  className?: string;
}) {
  const [a, b, c] = fotos;
  if (!a) return null;
  const quadro = "relative overflow-hidden rounded-[22px] border-3 border-tinta bg-papel shadow-[7px_7px_0_var(--tc-rosa)]";
  const foto = (f: Foto, principal: boolean) => (
    <Image src={urlFoto(f.caminho)} alt={f.alt ?? ""} fill priority={prioridade && principal} sizes={tamanhos} className="object-cover" />
  );
  return (
    <div className={cx("relative grid gap-3 pb-2 pr-2 md:gap-4", b && "grid-cols-[1.35fr_1fr]", c && "grid-rows-2", className)}>
      <div className={cx(quadro, c && "row-span-2")}>{foto(a, true)}</div>
      {b && <div className={cx(quadro, "-rotate-1")}>{foto(b, false)}</div>}
      {c && <div className={cx(quadro, "rotate-1")}>{foto(c, false)}</div>}
      {selo && <Selo fundo="citrino" brilho={false} className="absolute -bottom-1 left-4 -rotate-3">{selo}</Selo>}
    </div>
  );
}
