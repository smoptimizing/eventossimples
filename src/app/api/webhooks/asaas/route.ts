import { NextResponse, type NextRequest } from "next/server";
import { syncAndNotify } from "@/lib/confirm";

// Cada Cliente cria, no painel do Asaas (Integrações > Webhooks), um webhook de cobranças para /api/webhooks/asaas.
// O corpo só indica QUAL inscrição mudou; o status é sempre confirmado na API do Asaas.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const orderId: string | undefined = body?.payment?.externalReference;
  if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
    try {
      await syncAndNotify(orderId);
    } catch (e) {
      console.error("Webhook Asaas", e);
    }
  }
  return NextResponse.json({ received: true });
}
