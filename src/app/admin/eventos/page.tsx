import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/auth";
import { EventStatusBadge } from "@/components/badges";
import { ConfirmButton } from "@/components/ui";
import { ageRangeLabel, dateTime, eventPeriod, money } from "@/lib/format";
import { QUESTION_TYPE_LABEL, type EventRow, type Item, type Lot, type Question } from "@/lib/types";
import { approveEvent, rejectEvent } from "../actions";

export const metadata = { title: "Aprovação de eventos" };

type Full = EventRow & {
  organizers: { name: string; email: string | null };
  items: Item[];
  lots: (Lot & { lot_prices: { item_id: string; price: number }[] })[];
  questions: Question[];
};

function Detail({ e }: { e: Full }) {
  const nameOf = new Map(e.items.map((i) => [i.id, i.name]));
  const ages = ageRangeLabel(e.min_age, e.max_age);
  return (
    <div className="grid gap-4 text-sm md:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div><dt className="text-zinc-500">Data</dt><dd>{eventPeriod(e.starts_at, e.ends_at)}</dd></div>
          <div><dt className="text-zinc-500">Local</dt><dd>{e.location || "—"}</dd></div>
          <div><dt className="text-zinc-500">Tema</dt><dd>{e.theme || "—"}</dd></div>
          <div><dt className="text-zinc-500">Preletor</dt><dd>{e.speaker || "—"}</dd></div>
          <div><dt className="text-zinc-500">Faixa etária</dt><dd>{ages ?? "livre"}</dd></div>
          <div><dt className="text-zinc-500">Vagas</dt><dd>{e.capacity ?? "sem limite"}</dd></div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-500">Inscrições</dt>
            <dd>{[e.reg_opens_at && `de ${dateTime(e.reg_opens_at)}`, e.reg_closes_at && `até ${dateTime(e.reg_closes_at)}`].filter(Boolean).join(" ") || "ao publicar, até encerrar"}</dd>
          </div>
        </dl>
        {e.description && <p className="whitespace-pre-line text-zinc-700">{e.description}</p>}
        <div>
          <p className="font-medium">Itens</p>
          <ul className="text-zinc-700">
            {e.items.sort((a, b) => Number(b.is_registration) - Number(a.is_registration) || a.position - b.position).map((i) => (
              <li key={i.id}>
                {i.name}: {money(i.price)}
                {i.options.length > 0 && ` · opções: ${i.options.join("; ")}`}
                {i.requires_item_id && ` · exige ${nameOf.get(i.requires_item_id)}`}
                {i.stock != null && ` · estoque ${i.stock}`}
              </li>
            ))}
          </ul>
        </div>
        {e.lots.length > 0 && (
          <div>
            <p className="font-medium">Lotes</p>
            <ul className="text-zinc-700">
              {e.lots.sort((a, b) => a.position - b.position).map((l) => (
                <li key={l.id}>
                  {l.name}
                  {l.starts_at && ` · de ${dateTime(l.starts_at)}`}
                  {l.ends_at && ` · até ${dateTime(l.ends_at)}`}
                  {l.quantity && ` · ${l.quantity} inscrições`}
                  {l.lot_prices.length > 0 && ` · ${l.lot_prices.map((p) => `${nameOf.get(p.item_id)} ${money(p.price)}`).join(", ")}`}
                </li>
              ))}
            </ul>
          </div>
        )}
        {e.questions.length > 0 && (
          <div>
            <p className="font-medium">Formulário</p>
            <ul className="text-zinc-700">
              {e.questions.sort((a, b) => a.position - b.position).map((q) => (
                <li key={q.id}>{q.label} ({QUESTION_TYPE_LABEL[q.type]}{q.required ? ", obrigatória" : ""})</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {e.art_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.art_url} alt="" className="w-full rounded-lg border border-zinc-200" />
      )}
    </div>
  );
}

export default async function AdminEventosPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data } = await supabase
    .from("events")
    .select("*, organizers(name, email), items(*), lots(*, lot_prices(item_id, price)), questions(*)")
    .neq("review_status", "none")
    .order("submitted_at", { ascending: true });
  const events = (data ?? []) as Full[];
  const pending = events.filter((e) => e.review_status === "pending");
  const others = events.filter((e) => e.review_status !== "pending").reverse();

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link href="/admin" className="text-sm text-zinc-500 hover:underline">← Administração</Link>
      <h1 className="text-2xl font-bold">Aprovação de eventos</h1>

      <section className="space-y-3">
        <h2 className="font-semibold">Aguardando aprovação ({pending.length})</h2>
        {pending.length === 0 && <p className="text-sm text-zinc-500">Nenhum evento aguardando.</p>}
        {pending.map((e) => (
          <div key={e.id} className="card space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <p className="text-lg font-semibold">{e.title}</p>
                <p className="text-sm text-zinc-500">{e.organizers.name} · enviado em {dateTime(e.submitted_at)}</p>
              </div>
              <form action={approveEvent.bind(null, e.id)}>
                <button className="btn-primary">Aprovar</button>
              </form>
            </div>
            <Detail e={e} />
            <form action={rejectEvent.bind(null, e.id)} className="flex flex-col gap-2 border-t border-zinc-100 pt-3 sm:flex-row">
              <input className="input" name="note" required placeholder="Motivo da recusa (o organizador verá esta mensagem)" />
              <button className="btn-danger shrink-0">Recusar</button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Já avaliados</h2>
        <div className="card overflow-x-auto p-0">
          <table className="data-table">
            <thead><tr><th>Evento</th><th>Cliente</th><th>Data</th><th>Situação</th><th>Avaliado em</th><th /></tr></thead>
            <tbody>
              {others.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">
                    {e.status !== "draft" ? <Link className="link" href={`/e/${e.slug}`} target="_blank">{e.title}</Link> : e.title}
                    {e.review_status === "rejected" && e.review_note && <p className="text-xs text-red-600">{e.review_note}</p>}
                  </td>
                  <td>{e.organizers.name}</td>
                  <td>{eventPeriod(e.starts_at, e.ends_at)}</td>
                  <td><EventStatusBadge status={e.status} review={e.review_status} /></td>
                  <td>{dateTime(e.reviewed_at)}</td>
                  <td>
                    {e.review_status === "approved" && (
                      <form action={rejectEvent.bind(null, e.id)} className="flex gap-2">
                        <input className="input w-48" name="note" required placeholder="Motivo" />
                        <ConfirmButton message="Suspender este evento? Ele sai do ar e volta a rascunho." className="btn-ghost px-3 py-1.5 text-red-600">
                          Suspender
                        </ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {others.length === 0 && <p className="p-4 text-sm text-zinc-500">Nenhum evento avaliado ainda.</p>}
        </div>
      </section>
    </div>
  );
}
