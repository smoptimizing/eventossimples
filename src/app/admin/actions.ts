"use server";

import { refresh, revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth";
import { notifyOrganizerReview } from "@/lib/email";
import type { ActionState } from "@/lib/types";

/** Pagamento da taxa recebido de um Cliente (abate do saldo devedor). */
export async function registerFeePayment(organizerId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requirePlatformAdmin();
  const amount = Number(String(form.get("amount") ?? "").replace(/[R$\s.]/g, "").replace(",", "."));
  const paidOn = String(form.get("paid_on") ?? "");
  if (!(amount > 0)) return { error: "Informe o valor recebido." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Informe a data do pagamento." };
  const { error } = await supabase
    .from("fee_payments")
    .insert({ organizer_id: organizerId, amount, paid_on: paidOn, note: String(form.get("note") ?? "").trim() || null });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  refresh();
  return { success: "Pagamento registrado." };
}

export async function deleteFeePayment(organizerId: string, paymentId: string) {
  const { supabase } = await requirePlatformAdmin();
  await supabase.from("fee_payments").delete().eq("id", paymentId).eq("organizer_id", organizerId);
  revalidatePath("/admin", "layout");
  refresh();
}

async function decide(eventId: string, approved: boolean, note: string | null) {
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase
    .from("events")
    .update({ review_status: approved ? "approved" : "rejected", review_note: note })
    .eq("id", eventId)
    .select("title, organizers(email)")
    .single();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (data) await notifyOrganizerReview((data.organizers as any)?.email ?? null, data.title, approved, note, eventId);
  revalidatePath("/admin", "layout");
}

export async function approveEvent(eventId: string) {
  await decide(eventId, true, null);
}

/** Recusa um evento pendente ou suspende um já aprovado (sai do ar e volta a rascunho). */
export async function rejectEvent(eventId: string, form: FormData) {
  const note = String(form.get("note") ?? "").trim() || null;
  await decide(eventId, false, note);
}
