import { NextResponse, type NextRequest } from "next/server";
import { syncAndNotify } from "@/lib/confirm";

// URL de notificação enviada em cada cobrança: /api/webhooks/mercadopago?order=<id>.
// O status é sempre confirmado consultando a API do Mercado Pago.
export async function POST(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("order");
  if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
    try {
      await syncAndNotify(orderId);
    } catch (e) {
      console.error("Webhook Mercado Pago", e);
    }
  }
  return NextResponse.json({ received: true });
}
