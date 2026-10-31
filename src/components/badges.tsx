import { ORDER_STATUS_LABEL, type EventStatus, type OrderStatus, type ReviewStatus } from "@/lib/types";

const EVENT: Record<EventStatus, [string, string]> = {
  draft: ["Rascunho", "bg-zinc-100 text-zinc-700"],
  published: ["Inscrições abertas", "bg-emerald-100 text-emerald-800"],
  closed: ["Encerrado", "bg-red-100 text-red-700"],
};

const REVIEW: Partial<Record<ReviewStatus, [string, string]>> = {
  pending: ["Aguardando aprovação", "bg-amber-100 text-amber-800"],
  rejected: ["Não aprovado", "bg-red-100 text-red-700"],
  approved: ["Aprovado — não publicado", "bg-brand-100 text-brand-800"],
};

/** Situação do evento; no rascunho, mostra a etapa da aprovação. */
export function EventStatusBadge({ status, review }: { status: EventStatus; review?: ReviewStatus }) {
  const [label, cls] = (status === "draft" && review && REVIEW[review]) || EVENT[status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

const ORDER: Record<OrderStatus, string> = {
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-700",
  expired: "bg-zinc-200 text-zinc-700",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${ORDER[status]}`}>{ORDER_STATUS_LABEL[status]}</span>;
}
