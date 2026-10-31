import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Availability, EventRow, Item, Question } from "@/lib/types";

export type RegState = "open" | "soon" | "closed" | "soldout" | "nolot";

export const REG_STATE_LABEL: Record<RegState, string> = {
  open: "Inscrições abertas",
  soon: "Inscrições em breve",
  closed: "Inscrições encerradas",
  soldout: "Vagas esgotadas",
  nolot: "Sem lote disponível",
};

export function registrationState(event: EventRow, av: Availability | null): RegState {
  const now = Date.now();
  if (event.status !== "published") return "closed";
  if (event.reg_opens_at && now < new Date(event.reg_opens_at).getTime()) return "soon";
  if (event.reg_closes_at && now > new Date(event.reg_closes_at).getTime()) return "closed";
  if (av?.remaining === 0) return "soldout";
  if (av?.has_lots && !av.lot) return "nolot";
  return "open";
}

/** Evento público com itens, perguntas, disponibilidade e o nome do organizador. */
export async function loadPublicEvent(slug: string) {
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("slug", slug)
    .in("status", ["published", "closed"])
    .maybeSingle();
  if (!event) return null;
  const [{ data: items }, { data: questions }, { data: av }, { data: org }] = await Promise.all([
    supabase.from("items").select("*").eq("event_id", event.id).eq("active", true).order("is_registration", { ascending: false }).order("position"),
    supabase.from("questions").select("*").eq("event_id", event.id).order("position"),
    supabase.rpc("event_availability", { p_event: event.id }),
    createAdminClient().from("organizers").select("name, provider").eq("id", event.organizer_id).single(),
  ]);
  const availability = av as Availability | null;
  const priceOf = new Map((availability?.items ?? []).map((i) => [i.id, i]));
  const withPrices = ((items ?? []) as Item[]).map((i) => ({
    ...i,
    price: Number(priceOf.get(i.id)?.price ?? i.price),
    remaining: priceOf.get(i.id)?.remaining ?? null,
  }));
  return {
    event: event as EventRow,
    items: withPrices,
    questions: (questions ?? []) as Question[],
    availability,
    organizerName: (org?.name as string) ?? "",
    state: registrationState(event as EventRow, availability),
  };
}

export type PublicItem = Item & { remaining: number | null };
