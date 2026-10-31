"use server";

import { revalidatePath } from "next/cache";
import { loadReceipt } from "@/lib/receipt";
import { syncAndNotify } from "@/lib/confirm";
import { createGatewayCheckout } from "@/lib/payments";
import type { ActionState } from "@/lib/types";

export async function checkPayment(code: string, key: string): Promise<ActionState> {
  const r = await loadReceipt(code, key);
  if (!r) return { error: "Inscrição não encontrada." };
  try {
    const ok = await syncAndNotify(r.order.id);
    revalidatePath(`/inscricao/${code}`);
    return ok ? { success: "Pagamento confirmado!" } : { error: "O pagamento ainda não foi identificado. Pix costuma confirmar em poucos minutos." };
  } catch {
    return { error: "Não foi possível consultar o pagamento agora. Tente novamente em instantes." };
  }
}

export async function retryCheckout(code: string, key: string): Promise<ActionState> {
  const r = await loadReceipt(code, key);
  if (!r) return { error: "Inscrição não encontrada." };
  try {
    await createGatewayCheckout(r.order.id);
    revalidatePath(`/inscricao/${code}`);
    return { success: "Pagamento gerado." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao gerar o pagamento." };
  }
}
