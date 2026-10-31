import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/fetch-all";
import { ageOn } from "@/lib/format";
import type { Attendee, EventRow, Item, Order, OrderItem, OrderStatus, Question } from "@/lib/types";

export type Row = Order & { effective: OrderStatus };

/** Situação considerando o prazo de pagamento (pendente vencido = expirada). */
function effective(o: Order): OrderStatus {
  return o.status === "pending" && new Date(o.expires_at).getTime() < Date.now() ? "expired" : o.status;
}

const AGE_BUCKETS: [string, number, number][] = [
  ["até 11", 0, 11],
  ["12 a 14", 12, 14],
  ["15 a 17", 15, 17],
  ["18 a 24", 18, 24],
  ["25 a 34", 25, 34],
  ["35 a 49", 35, 49],
  ["50+", 50, 200],
];

/** Todos os dados do evento para o dashboard e as exportações (respeita o RLS do dono). */
export async function loadEventData(supabase: SupabaseClient, event: EventRow) {
  const id = event.id;
  const [orders, attendees, orderItems, { data: itemData }, { data: questionData }] = await Promise.all([
    fetchAll<Order>((a, b) => supabase.from("orders").select("*").eq("event_id", id).order("created_at").range(a, b)),
    fetchAll<Attendee>((a, b) => supabase.from("attendees").select("*").eq("event_id", id).order("order_id").order("position").range(a, b)),
    fetchAll<OrderItem>((a, b) => supabase.from("order_items").select("*, orders!inner(event_id)").eq("orders.event_id", id).range(a, b)),
    supabase.from("items").select("*").eq("event_id", id).order("is_registration", { ascending: false }).order("position"),
    supabase.from("questions").select("*").eq("event_id", id).order("position"),
  ]);
  const rows: Row[] = orders.map((o) => ({ ...o, effective: effective(o) }));
  return {
    orders: rows,
    orderById: new Map(rows.map((o) => [o.id, o])),
    attendees,
    orderItems,
    items: (itemData ?? []) as Item[],
    questions: (questionData ?? []) as Question[],
  };
}

export type EventData = Awaited<ReturnType<typeof loadEventData>>;

export function computeStats(event: EventRow, d: EventData) {
  const status = (orderId: string) => d.orderById.get(orderId)?.effective ?? "cancelled";
  const people = new Map<string, number>();
  d.attendees.forEach((a) => people.set(a.order_id, (people.get(a.order_id) ?? 0) + 1));
  const paidOrders = d.orders.filter((o) => o.effective === "paid");
  const pendingOrders = d.orders.filter((o) => o.effective === "pending");
  const confirmedPeople = d.attendees.filter((a) => status(a.order_id) === "paid");
  const pendingPeople = d.attendees.filter((a) => status(a.order_id) === "pending").length;
  const gross = paidOrders.reduce((s, o) => s + Number(o.total), 0);
  const fee = paidOrders.reduce((s, o) => s + Number(o.fee_amount), 0);

  const ordersByStatus: Record<OrderStatus, number> = { paid: 0, pending: 0, cancelled: 0, expired: 0 };
  d.orders.forEach((o) => ordersByStatus[o.effective]++);

  const items = d.items.map((item) => {
    const lines = d.orderItems.filter((l) => l.item_id === item.id);
    const paid = lines.filter((l) => status(l.order_id) === "paid");
    const options = new Map<string, number>();
    paid.forEach((l) => l.option && options.set(l.option, (options.get(l.option) ?? 0) + l.quantity));
    return {
      item,
      paidQty: paid.reduce((s, l) => s + l.quantity, 0),
      pendingQty: lines.filter((l) => status(l.order_id) === "pending").reduce((s, l) => s + l.quantity, 0),
      revenue: paid.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0),
      options: [...options.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
    };
  });

  const lotMap = new Map<string, { name: string; people: number; revenue: number }>();
  paidOrders.forEach((o) => {
    const key = o.lot_name ?? "Sem lote";
    const cur = lotMap.get(key) ?? { name: key, people: 0, revenue: 0 };
    cur.people += (people.get(o.id) ?? 0);
    cur.revenue += Number(o.total);
    lotMap.set(key, cur);
  });

  const ages = AGE_BUCKETS.map(([label, min, max]) => ({
    label,
    count: confirmedPeople.filter((a) => {
      const age = ageOn(a.birth_date, event.starts_at ?? undefined);
      return age != null && age >= min && age <= max;
    }).length,
  }));
  const noAge = confirmedPeople.filter((a) => !a.birth_date).length;
  if (noAge) ages.push({ label: "sem data", count: noAge });

  // Inscrições confirmadas por dia (data do pedido).
  const perDay = new Map<string, number>();
  paidOrders.forEach((o) => {
    const day = new Date(o.created_at).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    perDay.set(day, (perDay.get(day) ?? 0) + (people.get(o.id) ?? 0));
  });

  const answers = d.questions
    .filter((q) => q.type === "select" || q.type === "yesno")
    .map((q) => {
      const counts = new Map<string, number>();
      confirmedPeople.forEach((a) => {
        const v = a.answers?.[q.id];
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      });
      return { question: q, counts: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
    });

  return {
    capacity: event.capacity,
    confirmed: confirmedPeople.length,
    pendingPeople,
    remaining: event.capacity == null ? null : Math.max(event.capacity - confirmedPeople.length - pendingPeople, 0),
    gross,
    fee,
    net: gross - fee,
    pendingValue: pendingOrders.reduce((s, o) => s + Number(o.total), 0),
    ordersByStatus,
    items,
    lots: [...lotMap.values()],
    ages,
    perDay: [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    answers,
  };
}

export type Stats = ReturnType<typeof computeStats>;

/** Uma linha por participante, com itens e respostas (para lista, Excel e PDF). */
export function attendeeRows(event: EventRow, d: EventData) {
  return d.attendees.map((a) => {
    const o = d.orderById.get(a.order_id)!;
    const lines = d.orderItems.filter((l) => l.attendee_id === a.id);
    return {
      attendee: a,
      order: o,
      age: ageOn(a.birth_date, event.starts_at ?? undefined),
      items: lines,
      itemsLabel: lines
        .filter((l) => d.items.find((i) => i.id === l.item_id)?.is_registration !== true)
        .map((l) => `${l.quantity > 1 ? `${l.quantity}× ` : ""}${l.item_name}${l.option ? ` (${l.option})` : ""}`)
        .join(", "),
      value: lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0),
    };
  });
}
