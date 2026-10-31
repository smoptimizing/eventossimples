"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createGatewayCheckout } from "@/lib/payments";
import { sendReceiptEmail } from "@/lib/email";
import { isValidCpf, isValidPhone, onlyDigits } from "@/lib/format";
import type { ActionState } from "@/lib/types";

export interface RegistrationPayload {
  buyer: { name: string; email: string; phone: string; cpf: string };
  attendees: {
    name: string;
    birth_date: string;
    answers: Record<string, string>;
    items: { item_id: string; option: string | null; quantity: number }[];
  }[];
}

/** AAAA-MM-DD com ano de 4 dígitos a partir de 1900. */
function isValidDate(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900 && !Number.isNaN(Date.parse(v));
}

export async function createRegistration(eventId: string, payload: RegistrationPayload): Promise<ActionState> {
  const cpf = onlyDigits(payload.buyer.cpf);
  const phone = onlyDigits(payload.buyer.phone);
  if (cpf && !isValidCpf(cpf)) return { error: "CPF do responsável inválido." };
  if (!isValidPhone(phone)) return { error: "Informe o WhatsApp do responsável com DDD." };

  const admin = createAdminClient();
  const { data: ev } = await admin.from("events").select("title, organizers(provider)").eq("id", eventId).single();
  if (!ev) return { error: "Evento não encontrado." };

  // Respostas com formato: confere (o banco confere se as obrigatórias foram respondidas).
  const { data: masked } = await admin.from("questions").select("id, label, type").eq("event_id", eventId).in("type", ["phone", "cpf", "cep", "date"]);
  for (const a of payload.attendees) {
    if (a.birth_date && !isValidDate(a.birth_date)) return { error: `${a.name}: data de nascimento inválida.` };
    for (const q of masked ?? []) {
      const v = a.answers[q.id]?.trim();
      if (!v) continue;
      const ok =
        q.type === "phone" ? isValidPhone(v)
        : q.type === "cpf" ? isValidCpf(v)
        : q.type === "date" ? isValidDate(v)
        : onlyDigits(v).length === 8;
      if (!ok) return { error: `${a.name}: "${q.label}" está incompleto ou inválido.` };
    }
  }

  const { data, error } = await admin.rpc("create_order", { p_event: eventId, p_payload: { ...payload, buyer: { ...payload.buyer, cpf, phone } } });
  if (error) return { error: error.message };
  const result = data as { id: string; code: string; access_key: string; total: number; status: string };

  if (result.status === "pending") {
    // O Asaas exige CPF do pagador (o formulário já pede quando o evento é pago).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((ev.organizers as any)?.provider === "asaas" && !cpf) {
      await admin.from("orders").update({ status: "cancelled" }).eq("id", result.id);
      return { error: "Informe o CPF do responsável para o pagamento." };
    }
    try {
      await createGatewayCheckout(result.id);
    } catch (e) {
      // A inscrição fica reservada; o comprovante oferece "Tentar pagar novamente".
      console.error("Checkout", e);
    }
  }
  await sendReceiptEmail({ ...result, buyer_name: payload.buyer.name, buyer_email: payload.buyer.email }, ev.title);
  redirect(`/inscricao/${result.code}?k=${result.access_key}`);
}
