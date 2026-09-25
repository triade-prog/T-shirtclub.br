import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@tshirtclub/ui", "@tshirtclub/domain", "@tshirtclub/servidor"],
  images: { formats: ["image/avif", "image/webp"] },
};

export default config;
