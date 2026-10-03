import {
  Anchor, Bird, BookOpen, Camera, Cat, Cherry, Church, Citrus, Coffee, Cross, Crown, Dog, Feather, Fish, Flower2, Gem, Gift,
  HandHeart, Heart, IceCreamCone, Leaf, Moon, Music, Palette, PawPrint, Plane, Rainbow, Sailboat, Shell, Shirt, Sparkles, Star,
  Sun, TreePalm, Waves, Wine, type LucideIcon,
} from "lucide-react";

/**
 * Ícones do círculo do Pick your story (02/10, 0500): no lugar da foto, como as capas dos
 * destaques do Instagram, um ícone de traço fino na cor da coleção. A loja escolhe no painel; a
 * chave é o que fica gravado (o banco só confere o formato). Para acrescentar um, basta pôr aqui.
 */
export const ICONES_STORY = {
  camiseta: { rotulo: "Camiseta", Icone: Shirt },
  limao: { rotulo: "Limão", Icone: Citrus },
  cereja: { rotulo: "Cereja", Icone: Cherry },
  sorvete: { rotulo: "Sorvete", Icone: IceCreamCone },
  cafe: { rotulo: "Café", Icone: Coffee },
  taca: { rotulo: "Taça", Icone: Wine },
  onda: { rotulo: "Onda", Icone: Waves },
  barco: { rotulo: "Barco", Icone: Sailboat },
  ancora: { rotulo: "Âncora", Icone: Anchor },
  concha: { rotulo: "Concha", Icone: Shell },
  peixe: { rotulo: "Peixe", Icone: Fish },
  palmeira: { rotulo: "Palmeira", Icone: TreePalm },
  sol: { rotulo: "Sol", Icone: Sun },
  lua: { rotulo: "Lua", Icone: Moon },
  estrela: { rotulo: "Estrela", Icone: Star },
  brilho: { rotulo: "Brilho", Icone: Sparkles },
  arco_iris: { rotulo: "Arco-íris", Icone: Rainbow },
  cruz: { rotulo: "Cruz", Icone: Cross },
  igreja: { rotulo: "Igreja", Icone: Church },
  pomba: { rotulo: "Pomba", Icone: Bird },
  maos: { rotulo: "Mãos com coração", Icone: HandHeart },
  coracao: { rotulo: "Coração", Icone: Heart },
  flor: { rotulo: "Flor", Icone: Flower2 },
  folha: { rotulo: "Folha", Icone: Leaf },
  pena: { rotulo: "Pena", Icone: Feather },
  coroa: { rotulo: "Coroa", Icone: Crown },
  joia: { rotulo: "Joia", Icone: Gem },
  presente: { rotulo: "Presente", Icone: Gift },
  pata: { rotulo: "Pata", Icone: PawPrint },
  cachorro: { rotulo: "Cachorro", Icone: Dog },
  gato: { rotulo: "Gato", Icone: Cat },
  camera: { rotulo: "Câmera", Icone: Camera },
  musica: { rotulo: "Música", Icone: Music },
  livro: { rotulo: "Livro", Icone: BookOpen },
  aviao: { rotulo: "Avião", Icone: Plane },
  arte: { rotulo: "Arte", Icone: Palette },
} as const satisfies Record<string, { rotulo: string; Icone: LucideIcon }>;

export type IconeStory = keyof typeof ICONES_STORY;

/** O ícone gravado; sem escolha (ou com um que saiu da lista), a camiseta. O hasOwn deixa de fora
 *  as chaves do protótipo ("constructor" passa no formato do banco). */
function doStory(chave: string | null | undefined) {
  return chave && Object.hasOwn(ICONES_STORY, chave) ? ICONES_STORY[chave as IconeStory] : ICONES_STORY.camiseta;
}

export function iconeDoStory(chave: string | null | undefined): LucideIcon {
  return doStory(chave).Icone;
}

/** O nome do ícone, para o painel. */
export function rotuloDoIcone(chave: string | null | undefined): string {
  return doStory(chave).rotulo;
}
