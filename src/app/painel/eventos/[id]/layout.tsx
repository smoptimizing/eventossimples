import Link from "next/link";
import { requireOwnEvent } from "@/lib/auth";
import { EventStatusBadge } from "@/components/badges";
import { ConfirmButton } from "@/components/ui";
import { setEventStatus, submitForReview } from "../../actions";
import { Tabs } from "./tabs";

export default async function EventLayout({ children, params }: LayoutProps<"/painel/eventos/[id]">) {
  const { id } = await params;
  const { event } = await requireOwnEvent(id);
  const review = event.review_status;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link href="/painel" className="text-sm text-zinc-500 hover:underline print:hidden">← Meus eventos</Link>
      <div className="mt-1 mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">{event.title}</h1>
        <EventStatusBadge status={event.status} review={review} />
        <div className="flex gap-2 print:hidden">
          {event.status !== "draft" && (
            <Link href={`/e/${event.slug}`} target="_blank" className="btn-secondary">Ver página</Link>
          )}
          {(review === "none" || review === "rejected") && (
            <form action={submitForReview.bind(null, id)}>
              <ConfirmButton message="Enviar o evento para aprovação? Você pode continuar editando enquanto aguarda." className="btn-primary">
                Enviar para aprovação
              </ConfirmButton>
            </form>
          )}
          {review === "approved" && event.status !== "published" && (
            <form action={setEventStatus.bind(null, id, "published")}>
              <button className="btn-primary">{event.status === "draft" ? "Publicar" : "Reabrir inscrições"}</button>
            </form>
          )}
          {review === "approved" && event.status === "published" && (
            <form action={setEventStatus.bind(null, id, "closed")}>
              <ConfirmButton message="Encerrar as inscrições? A página continua visível.">Encerrar inscrições</ConfirmButton>
            </form>
          )}
        </div>
      </div>
      {review === "none" && (
        <p className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800 print:hidden">
          Preencha os dados, itens, lotes e formulário. Quando estiver pronto, clique em <b>Enviar para aprovação</b>: o evento vai ao ar depois de
          aprovado pela plataforma.
        </p>
      )}
      {review === "pending" && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 print:hidden">
          Evento enviado para aprovação. Você pode continuar ajustando enquanto aguarda; avisaremos quando for aprovado.
        </p>
      )}
      {review === "rejected" && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 print:hidden">
          O evento não foi aprovado{event.review_note ? `: ${event.review_note}` : "."} Faça os ajustes e envie novamente.
        </p>
      )}
      <Tabs id={id} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
