import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendReceiptEmail } from "@/lib/email";
import { syncGatewayOrder } from "@/lib/payments";

/** Consulta o gateway e, se acabou de confirmar, avisa o responsável por e-mail. */
export async function syncAndNotify(orderId: string) {
  const confirmed = await syncGatewayOrder(orderId);
  if (!confirmed) return false;
  const { data } = await createAdminClient().from("orders").select("*, events(title)").eq("id", orderId).single();
  if (data) await sendReceiptEmail(data, data.events?.title ?? "Evento");
  return true;
}
