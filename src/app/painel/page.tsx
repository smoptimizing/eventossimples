import Link from "next/link";
import { requireOrganizer } from "@/lib/auth";
import { EventStatusBadge } from "@/components/badges";
import { eventPeriod } from "@/lib/format";
import type { EventRow } from "@/lib/types";
import { NewEventForm } from "./new-event-form";

export const metadata = { title: "Painel" };

export default async function PainelPage() {
  const { supabase, organizer } = await requireOrganizer();
  const { data } = await supabase.from("events").select("*").eq("organizer_id", organizer.id).order("created_at", { ascending: false });
  const events = (data ?? []) as EventRow[];
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{organizer.name}</h1>
          <p className="text-sm text-zinc-500">Seus eventos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && <Link href="/admin" className="btn-secondary">Administração</Link>}
          <Link href="/painel/taxas" className="btn-secondary">Taxas e extrato</Link>
          <Link href="/painel/conta" className="btn-secondary">Conta e recebimento</Link>
        </div>
      </div>

      {!organizer.provider && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Configure o recebimento (Asaas, Mercado Pago ou PagBank) em <Link href="/painel/conta" className="link">Conta e recebimento</Link> para
          publicar eventos pagos.
        </p>
      )}
      {!organizer.active && (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">Sua conta está suspensa. Fale com o suporte da plataforma.</p>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">Novo evento</h2>
        <NewEventForm />
      </div>

      <div className="grid gap-3">
        {events.length === 0 && <p className="text-zinc-500">Nenhum evento ainda.</p>}
        {events.map((e) => (
          <Link key={e.id} href={`/painel/eventos/${e.id}`} className="card flex items-center gap-4 p-4 transition hover:shadow-md">
            {e.art_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.art_url} alt="" className="h-14 w-20 rounded-lg object-cover" />
            ) : (
              <div className="grid h-14 w-20 place-items-center rounded-lg bg-brand-100 text-brand-600">✦</div>
            )}
            <div className="flex-1">
              <p className="font-semibold">{e.title}</p>
              <p className="text-sm text-zinc-500">{eventPeriod(e.starts_at, e.ends_at)}</p>
            </div>
            <EventStatusBadge status={e.status} review={e.review_status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
