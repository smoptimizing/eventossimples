import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { EventRow, Organizer } from "@/lib/types";

export async function getSessionUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function requireUser(next?: string) {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect(`/entrar${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return { supabase, user };
}

/** Cliente (organizador) do usuário logado. Sem cadastro de cliente, pede para completar. */
export async function requireOrganizer() {
  const { supabase, user } = await requireUser("/painel");
  const { data } = await supabase.from("organizers").select("*").eq("owner_id", user.id).maybeSingle();
  if (!data) redirect("/painel/conta?novo=1");
  return { supabase, user, organizer: data as Organizer };
}

/** Evento do cliente logado (ou volta para o painel). */
export async function requireOwnEvent(eventId: string) {
  const ctx = await requireOrganizer();
  const { data } = await ctx.supabase.from("events").select("*").eq("id", eventId).eq("organizer_id", ctx.organizer.id).maybeSingle();
  if (!data) redirect("/painel");
  return { ...ctx, event: data as EventRow };
}

export async function requirePlatformAdmin() {
  const { supabase, user } = await requireUser("/admin");
  const { data } = await supabase.rpc("is_platform_admin");
  if (!data) redirect("/painel");
  return { supabase, user };
}
