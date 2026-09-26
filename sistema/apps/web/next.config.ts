import type { NextConfig } from "next";

// Fotos do catálogo no Storage do Supabase (bucket público "catalogo"), otimizadas pelo next/image
const origem = process.env.ORIGEM_IMAGENS ? new URL(process.env.ORIGEM_IMAGENS) : null;
// Só quando as fotos vêm de um Supabase local (desenvolvimento e testes): o otimizador recusa IP local por padrão
const origemLocal = origem !== null && ["127.0.0.1", "localhost"].includes(origem.hostname);

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@tshirtclub/ui", "@tshirtclub/domain", "@tshirtclub/servidor"],
  images: {
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowLocalIP: origemLocal,
    remotePatterns: origem ? [{ protocol: origem.protocol === "http:" ? "http" : "https", hostname: origem.hostname, port: origem.port, pathname: "/storage/v1/object/public/catalogo/**" }] : [],
  },
};

export default config;
