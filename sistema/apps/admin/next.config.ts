import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@tshirtclub/ui", "@tshirtclub/domain", "@tshirtclub/servidor"],
  images: { formats: ["image/avif", "image/webp"] },
  // Origem pública das fotos (Storage), para as miniaturas do catálogo; não é segredo e já está na CSP.
  env: { NEXT_PUBLIC_ORIGEM_IMAGENS: process.env.ORIGEM_IMAGENS ?? "" },
};

export default config;
