import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Upload da arte do evento (até 4 MB; a Vercel aceita no máximo 4,5 MB por requisição).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  serverExternalPackages: ["jspdf", "jspdf-autotable", "exceljs"],
};

export default nextConfig;
