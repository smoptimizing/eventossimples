import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { eventPeriod } from "@/lib/format";
import type { EventRow } from "@/lib/types";

/** Eventos que começaram até ontem ainda aparecem (eventos de vários dias). */
function yesterday() {
  return new Date(Date.now() - 86400000).toISOString();
}

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("status", "published")
    .gte("starts_at", yesterday())
    .order("starts_at");
  const events = (data ?? []) as EventRow[];

  return (
    <div>
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h1 className="max-w-2xl text-3xl font-bold sm:text-4xl">Inscrições para acampamentos, retiros e conferências</h1>
          <p className="mt-3 max-w-xl text-brand-100">
            Organize seu evento em minutos: lotes, ônibus, camisas, formulário personalizado e pagamento online com confirmação automática.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/cadastro" className="btn bg-white text-brand-800 hover:bg-brand-50">Quero organizar um evento</Link>
            <Link href="/comprovante" className="btn border border-white/40 text-white hover:bg-white/10">Ver meu comprovante</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="mb-4 text-xl font-bold">Próximos eventos</h2>
        {events.length === 0 ? (
          <p className="text-zinc-500">Nenhum evento com inscrições no momento.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Link key={e.id} href={`/e/${e.slug}`} className="card overflow-hidden p-0 transition hover:shadow-md">
                {e.art_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.art_url} alt="" className="aspect-video w-full object-cover" />
                ) : (
                  <div className="grid aspect-video place-items-center bg-brand-100 text-4xl text-brand-600">✦</div>
                )}
                <div className="p-4">
                  <p className="font-semibold">{e.title}</p>
                  {e.theme && <p className="text-sm text-zinc-600">{e.theme}</p>}
                  <p className="mt-2 text-xs text-zinc-500">{eventPeriod(e.starts_at, e.ends_at)}{e.location ? ` · ${e.location}` : ""}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
