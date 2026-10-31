export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Inscreva";

export function siteUrl(path = "") {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return base + path;
}
