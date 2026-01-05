import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdfjs-dist",
    "@napi-rs/canvas",
    "docx",
  ],
};

export default nextConfig;
