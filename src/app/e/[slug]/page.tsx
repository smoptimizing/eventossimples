import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicEvent, REG_STATE_LABEL } from "@/lib/events";
import { ageRangeLabel, dateTime, eventPeriod, money } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const data = await loadPublicEvent(slug);
  return { title: data?.event.title ?? "Evento" };
}

export default async function EventPage({ params }: PageProps<"/e/[slug]">) {
  const { slug } = await params;
  const data = await loadPublicEvent(slug);
  if (!data) notFound();
  const { event, items, availability, organizerName, state } = data;
  const ages = ageRangeLabel(event.min_age, event.max_age);
  const extras = items.filter((i) => !i.is_registration);
  const registration = items.find((i) => i.is_registration);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {event.art_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.art_url} alt={`Arte de ${event.title}`} className="mb-6 w-full rounded-2xl border border-zinc-200 object-cover" />
      )}
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <div>
            <p className="text-sm text-zinc-500">{organizerName}</p>
            <h1 className="text-3xl font-bold">{event.title}</h1>
            {event.theme && <p className="mt-1 text-lg text-brand-700">Tema: {event.theme}</p>}
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Data" value={eventPeriod(event.starts_at, event.ends_at)} />
            {event.location && <Info label="Local" value={event.location} />}
            {event.speaker && <Info label="Preletor" value={event.speaker} />}
            {ages && <Info label="Faixa etária" value={ages} />}
            {(event.reg_opens_at || event.reg_closes_at) && (
              <Info
                label="Inscrições"
                value={[event.reg_opens_at && `de ${dateTime(event.reg_opens_at)}`, event.reg_closes_at && `até ${dateTime(event.reg_closes_at)}`].filter(Boolean).join(" ")}
              />
            )}
          </dl>
          {event.description && <div className="whitespace-pre-line text-zinc-700">{event.description}</div>}
        </div>

        <aside className="card h-fit space-y-4">
          <p className={`badge ${state === "open" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-700"}`}>{REG_STATE_LABEL[state]}</p>
          {availability?.lot && <p className="text-sm text-zinc-600">Lote atual: <b>{availability.lot.name}</b>{availability.lot.ends_at && ` (até ${dateTime(availability.lot.ends_at)})`}</p>}
          {registration && (
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase">Inscrição</p>
              <p className="text-3xl font-bold">{registration.price > 0 ? money(registration.price) : "Gratuita"}</p>
            </div>
          )}
          {extras.length > 0 && (
            <ul className="space-y-1 text-sm">
              {extras.map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>{i.name}</span>
                  <span className="text-zinc-600">{i.remaining === 0 ? "esgotado" : money(i.price)}</span>
                </li>
              ))}
            </ul>
          )}
          {availability?.remaining != null && availability.remaining > 0 && availability.remaining <= 20 && (
            <p className="text-sm font-medium text-amber-700">Restam {availability.remaining} vagas</p>
          )}
          {state === "open" ? (
            <Link href={`/e/${event.slug}/inscricao`} className="btn-primary w-full py-3 text-base">Fazer inscrição</Link>
          ) : (
            <button className="btn-secondary w-full" disabled>{REG_STATE_LABEL[state]}</button>
          )}
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-zinc-500 uppercase">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
