import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPublicEvent, REG_STATE_LABEL } from "@/lib/events";
import { ageRangeLabel, eventPeriod } from "@/lib/format";
import { RegistrationForm } from "./registration-form";

export const metadata = { title: "Inscrição" };

export default async function InscricaoPage({ params }: PageProps<"/e/[slug]/inscricao">) {
  const { slug } = await params;
  const data = await loadPublicEvent(slug);
  if (!data) notFound();
  const { event, items, questions, state } = data;
  const ages = ageRangeLabel(event.min_age, event.max_age);
  const paid = items.some((i) => i.price > 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/e/${event.slug}`} className="text-sm text-zinc-500 hover:underline">← {event.title}</Link>
      <h1 className="mt-1 text-2xl font-bold">Inscrição</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {eventPeriod(event.starts_at, event.ends_at)}
        {ages && ` · ${ages}`}
      </p>
      {state === "open" ? (
        <RegistrationForm
          eventId={event.id}
          items={items}
          questions={questions}
          needsBirthDate={event.min_age != null || event.max_age != null}
          requireCpf={paid}
        />
      ) : (
        <p className="card text-center text-zinc-600">{REG_STATE_LABEL[state]}.</p>
      )}
    </div>
  );
}
