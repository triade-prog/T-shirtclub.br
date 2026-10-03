/**
 * Qualidade das fotos grandes da loja (capas, carrossel, capítulos de campanha, foto em destaque e
 * fotos da peça), de 0 a 100. O padrão do Next é 75; em 85 a textura do tecido e as bordas das
 * estampas ficam mais fiéis por ~9 KB a mais por foto no celular (teste de 03/10 com a foto do
 * topo: 38 → 47 KB em AVIF, ainda abaixo dos 64 KB do WebP 75). As miniaturas seguem em 75.
 * Precisa estar em images.qualities no next.config.
 */
export const QUALIDADE_FOTO_GRANDE = 85;
