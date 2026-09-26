import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "T-shirt Club.br",
    short_name: "T-shirt Club",
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#FFF9F5",
    theme_color: "#FFF9F5",
    icons: [
      { src: "/marca/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/marca/icone-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
