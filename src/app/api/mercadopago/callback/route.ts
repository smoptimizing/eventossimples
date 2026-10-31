import { NextResponse, type NextRequest } from "next/server";
import { requireOrganizer } from "@/lib/auth";
import { connectMercadoPago } from "@/lib/payments";

export async function GET(request: NextRequest) {
  const { organizer } = await requireOrganizer();
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const back = (q: string) => NextResponse.redirect(new URL(`/painel/conta?${q}`, url.origin));
  if (!code || !state || state !== request.cookies.get("mp_state")?.value) return back("erro=mp");
  try {
    await connectMercadoPago(organizer.id, code);
  } catch (e) {
    console.error("OAuth Mercado Pago", e);
    return back("erro=mp");
  }
  const res = back("ok=mp");
  res.cookies.delete("mp_state");
  return res;
}
