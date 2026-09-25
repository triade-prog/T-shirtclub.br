// Baloo 2 nos títulos de marca e Poppins no texto (D17). O next/font baixa na hora do build
// e serve do próprio domínio: nenhuma requisição ao Google no carregamento (G17).
import { Baloo_2, Poppins } from "next/font/google";

export const baloo = Baloo_2({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-baloo", display: "swap" });
export const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-poppins", display: "swap" });
