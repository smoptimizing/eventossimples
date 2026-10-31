"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { isValidPhone, onlyDigits } from "@/lib/format";
import type { ActionState } from "@/lib/types";

function safeNext(v: FormDataEntryValue | null) {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/painel";
}

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email")).trim(),
    password: String(form.get("password")),
  });
  if (error) return { error: error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: ActionState, form: FormData): Promise<ActionState> {
  const name = String(form.get("org_name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const phone = onlyDigits(String(form.get("phone") ?? "")) || null;
  const password = String(form.get("password"));
  if (name.length < 2) return { error: "Informe o nome da igreja ou organização." };
  if (phone && !isValidPhone(phone)) return { error: "Informe o WhatsApp com DDD." };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { org_name: name, phone }, emailRedirectTo: siteUrl("/auth/callback?next=/painel") },
  });
  if (error) {
    return { error: error.message.includes("already registered") ? "Este e-mail já tem cadastro. Use a opção Entrar." : error.message };
  }
  if (data.session && data.user) {
    const { error: orgError } = await supabase.from("organizers").insert({ owner_id: data.user.id, name, phone, email });
    if (orgError) return { error: orgError.message };
    redirect("/painel");
  }
  // Com confirmação por e-mail ligada, a organização é criada no primeiro acesso (/painel/conta).
  return { success: "Conta criada! Enviamos um link de confirmação para o seu e-mail. Clique nele para ativar o acesso." };
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(String(form.get("email")).trim(), {
    redirectTo: siteUrl("/auth/callback?next=/painel/senha"),
  });
  if (error) return { error: error.message };
  return { success: "Se houver uma conta com este e-mail, você receberá um link para criar uma nova senha." };
}
