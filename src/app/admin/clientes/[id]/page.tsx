import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth";
import { feeStatement } from "@/lib/fee-statement";
import { FeeStatementView } from "@/components/fee-statement-view";
import { ActionForm, ConfirmButton } from "@/components/ui";
import { DateInput } from "@/components/date-input";
import { maskCpfCnpj, maskPhone } from "@/lib/format";
import type { Organizer } from "@/lib/types";
import { deleteFeePayment, registerFeePayment } from "../../actions";

export const metadata = { title: "Cliente" };

export default async function AdminClientePage({ params }: PageProps<"/admin/clientes/[id]">) {
  const { id } = await params;
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase.from("organizers").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const org = data as Organizer;
  const statement = await feeStatement(supabase, id);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">← Administração</Link>
      <div>
        <h1 className="text-2xl font-bold">{org.name}</h1>
        <p className="text-sm text-zinc-500">
          {[org.document && maskCpfCnpj(org.document), org.email, org.phone && maskPhone(org.phone)].filter(Boolean).join(" · ")} · taxa atual{" "}
          {Number(org.fee_percent).toLocaleString("pt-BR")}%
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Registrar pagamento recebido</h2>
        <ActionForm action={registerFeePayment.bind(null, id)} className="grid items-end gap-3 sm:grid-cols-[160px_180px_1fr]" submitLabel="Registrar" resetOnSuccess>
          <div>
            <label className="label" htmlFor="amount">Valor (R$)</label>
            <input className="input" id="amount" name="amount" inputMode="decimal" required placeholder="0,00" />
          </div>
          <div>
            <label className="label" htmlFor="paid_on">Data</label>
            <DateInput id="paid_on" name="paid_on" required />
          </div>
          <div>
            <label className="label" htmlFor="note">Observação</label>
            <input className="input" id="note" name="note" placeholder="Ex.: Pix referente a outubro" />
          </div>
        </ActionForm>
      </section>

      <section className="card">
        <FeeStatementView
          s={statement}
          paymentAction={(p) => (
            <form action={deleteFeePayment.bind(null, id, p.id)}>
              <ConfirmButton message="Excluir este pagamento? O saldo do cliente volta a subir." className="btn-ghost px-2 py-1 text-red-600">
                Excluir
              </ConfirmButton>
            </form>
          )}
        />
      </section>
    </div>
  );
}
