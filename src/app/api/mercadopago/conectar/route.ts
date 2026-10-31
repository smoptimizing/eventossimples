import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizer } from "@/lib/auth";
import { mercadoPagoAuthUrl } from "@/lib/payments";

// Leva o Cliente ao Mercado Pago para autorizar a plataforma (marketplace) a cobrar em nome dele.
export async function GET() {
  await requireOrganizer();
  if (!process.env.MP_CLIENT_ID) return new NextResponse("MP_CLIENT_ID não configurado.", { status: 500 });
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(mercadoPagoAuthUrl(state));
  res.cookies.set("mp_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
