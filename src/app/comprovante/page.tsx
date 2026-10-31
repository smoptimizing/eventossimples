import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Meu comprovante" };

async function findReceipt(form: FormData) {
  "use server";
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const { data } = await createAdminClient()
    .from("orders")
    .select("code, access_key")
    .eq("code", code)
    .eq("buyer_email", email)
    .maybeSingle();
  if (!data) redirect("/comprovante?erro=1");
  redirect(`/inscricao/${data.code}?k=${data.access_key}`);
}

export default async function ComprovantePage({ searchParams }: PageProps<"/comprovante">) {
  const { erro } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <form action={findReceipt} className="card space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-bold">Meu comprovante</h1>
          <p className="text-sm text-zinc-500">Informe o código da inscrição e o e-mail do responsável.</p>
        </div>
        <div>
          <label className="label" htmlFor="code">Código</label>
          <input className="input font-mono uppercase tracking-widest" id="code" name="code" required maxLength={6} placeholder="AB12CD" />
        </div>
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input className="input" id="email" name="email" type="email" required />
        </div>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Inscrição não encontrada. Confira o código e o e-mail.</p>}
        <button className="btn-primary w-full">Ver comprovante</button>
      </form>
    </div>
  );
}
