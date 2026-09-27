// Três vozes (D24): Fraunces editorial nos títulos, Poppins no sistema e Baloo 2 nos momentos
// pop do Club. O next/font baixa na hora do build e serve do próprio domínio: nenhuma
// requisição ao Google no carregamento (G17).
import { Baloo_2, Fraunces, Poppins } from "next/font/google";

export const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-fraunces", display: "swap" });
export const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-poppins", display: "swap" });
// Sem pré-carregar a Baloo 2 (G17): nas páginas da vitrine ela fica abaixo do primeiro título
// (preços, faixa da coleção), então não disputa o início com a Fraunces e a Poppins, que estão
// acima da dobra (a Fraunces itálica inclusive, em "Club." no início e no título da coleção).
// O desenho não muda: com "swap", o texto aparece e troca para a Baloo assim que ela chega.
export const baloo = Baloo_2({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-baloo", display: "swap", preload: false });
