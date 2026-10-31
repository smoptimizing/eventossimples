import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Attendee, EventRow, Order, OrderItem } from "@/lib/types";

/** Inscrição pelo código + chave do link (o acampante não tem login). */
export async function loadReceipt(code: string, key: string | undefined | string[]) {
  if (typeof key !== "string" || !/^[0-9a-f]{24}$/.test(key)) return null;
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("*, events(*, organizers(name, phone, email))")
    .eq("code", code.toUpperCase())
    .eq("access_key", key)
    .maybeSingle();
  if (!order) return null;
  const [{ data: attendees }, { data: items }] = await Promise.all([
    admin.from("attendees").select("*").eq("order_id", order.id).order("position"),
    admin.from("order_items").select("*").eq("order_id", order.id),
  ]);
  const { events, ...rest } = order;
  const { organizers, ...event } = events;
  return {
    order: rest as Order,
    event: event as EventRow,
    organizer: organizers as { name: string; phone: string | null; email: string | null },
    attendees: (attendees ?? []) as Attendee[],
    items: (items ?? []) as OrderItem[],
  };
}

export type Receipt = NonNullable<Awaited<ReturnType<typeof loadReceipt>>>;

/** Situação considerando o prazo de pagamento. */
export function effectiveStatus(o: Order) {
  if (o.status === "pending" && new Date(o.expires_at).getTime() < Date.now()) return "expired" as const;
  return o.status;
}
