import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";

export interface FeePayment {
  id: string;
  organizer_id: string;
  amount: number;
  paid_on: string;
  note: string | null;
  created_at: string;
}

/**
 * Extrato da taxa da plataforma de um Cliente: taxa gerada por evento (inscrições pagas),
 * pagamentos já feitos à plataforma e saldo devedor.
 */
export async function feeStatement(client: SupabaseClient, organizerId: string) {
  const { data: events } = await client.from("events").select("id, title, starts_at").eq("organizer_id", organizerId);
  const ids = (events ?? []).map((e) => e.id as string);
  const orders = ids.length
    ? await fetchAll<{ event_id: string; total: number; fee_amount: number; paid_at: string | null }>((a, b) =>
        client.from("orders").select("event_id, total, fee_amount, paid_at").in("event_id", ids).eq("status", "paid").range(a, b),
      )
    : [];
  const { data: payments } = await client.from("fee_payments").select("*").eq("organizer_id", organizerId).order("paid_on", { ascending: false });

  const byEvent = (events ?? [])
    .map((e) => {
      const mine = orders.filter((o) => o.event_id === e.id);
      return {
        id: e.id as string,
        title: e.title as string,
        starts_at: e.starts_at as string | null,
        orders: mine.length,
        gross: mine.reduce((s, o) => s + Number(o.total), 0),
        fee: mine.reduce((s, o) => s + Number(o.fee_amount), 0),
      };
    })
    .filter((e) => e.orders > 0)
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""));

  const feeTotal = byEvent.reduce((s, e) => s + e.fee, 0);
  const paidTotal = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  return {
    byEvent,
    payments: (payments ?? []) as FeePayment[],
    gross: byEvent.reduce((s, e) => s + e.gross, 0),
    feeTotal,
    paidTotal,
    balance: Math.round((feeTotal - paidTotal) * 100) / 100,
  };
}

export type FeeStatement = Awaited<ReturnType<typeof feeStatement>>;
