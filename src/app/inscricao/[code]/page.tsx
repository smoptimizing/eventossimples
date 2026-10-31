import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { effectiveStatus, loadReceipt } from "@/lib/receipt";
import { dateShort, dateTime, eventPeriod, money } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/types";
import { PaymentBox } from "./payment-box";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Comprovante de inscrição", robots: { index: false } };

const STATUS_STYLE = {
  paid: "bg-emerald-100 text-emerald-800",
  pending: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-700",
  expired: "bg-zinc-200 text-zinc-700",
};

export default async function ReceiptPage({ params, searchParams }: PageProps<"/inscricao/[code]">) {
  const { code } = await params;
  const { k } = await searchParams;
  const r = await loadReceipt(code, k);
  if (!r) notFound();
  const { order, event, organizer, attendees, items } = r;
  const status = effectiveStatus(order);
  const [codeQr, pixQr] = await Promise.all([
    QRCode.toDataURL(order.code, { margin: 1, width: 240 }),
    order.pix_code && status === "pending" ? QRCode.toDataURL(order.pix_code, { margin: 1, width: 320 }) : null,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="card space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-zinc-500">Comprovante de inscrição</p>
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <p className="text-sm text-zinc-600">{eventPeriod(event.starts_at, event.ends_at)}{event.location ? ` · ${event.location}` : ""}</p>
            <p className="text-sm text-zinc-500">Organização: {organizer.name}</p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={codeQr} alt={`Código ${order.code}`} className="h-28 w-28" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`badge text-sm ${STATUS_STYLE[status]}`}>{ORDER_STATUS_LABEL[status]}</span>
          <span className="font-mono text-lg font-bold tracking-widest">{order.code}</span>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-zinc-500">Responsável</dt><dd className="font-medium">{order.buyer_name}</dd></div>
          <div><dt className="text-zinc-500">E-mail</dt><dd className="font-medium">{order.buyer_email}</dd></div>
          <div><dt className="text-zinc-500">Feita em</dt><dd className="font-medium">{dateTime(order.created_at)}</dd></div>
          {order.paid_at && <div><dt className="text-zinc-500">Pagamento confirmado em</dt><dd className="font-medium">{dateTime(order.paid_at)}</dd></div>}
          {order.lot_name && <div><dt className="text-zinc-500">Lote</dt><dd className="font-medium">{order.lot_name}</dd></div>}
        </dl>
      </div>

      {status === "pending" && (
        <div className="card space-y-3">
          <h2 className="font-semibold">Pagamento</h2>
          <p className="text-sm text-zinc-600">
            Sua vaga está reservada até <b>{dateTime(order.expires_at)}</b>. A inscrição é confirmada automaticamente após o pagamento.
          </p>
          <PaymentBox code={order.code} accessKey={order.access_key} checkoutUrl={order.checkout_url} pixCode={order.pix_code} pixQr={pixQr} />
        </div>
      )}
      {status === "expired" && (
        <p className="card text-sm text-zinc-600">
          O prazo de pagamento terminou e a vaga foi liberada. Se você já pagou, fale com a organização informando o código <b>{order.code}</b>.{" "}
          <Link className="link" href={`/e/${event.slug}/inscricao`}>Fazer nova inscrição</Link>
        </p>
      )}

      <div className="card space-y-4">
        <h2 className="font-semibold">Participantes</h2>
        {attendees.map((a) => (
          <div key={a.id} className="border-b border-zinc-100 pb-3 last:border-0 last:pb-0">
            <p className="font-medium">{a.name}{a.birth_date && <span className="font-normal text-zinc-500"> · nasc. {dateShort(a.birth_date)}</span>}</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {items.filter((i) => i.attendee_id === a.id).map((i) => (
                <li key={i.id} className="flex justify-between gap-2">
                  <span>{i.quantity > 1 && `${i.quantity}× `}{i.item_name}{i.option && ` (${i.option})`}</span>
                  <span className="text-zinc-600">{money(i.unit_price * i.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="flex justify-between border-t border-zinc-200 pt-3 text-lg font-bold">
          <span>Total</span>
          <span>{money(order.total)}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 print:hidden">
        <a href={`/inscricao/${order.code}/pdf?k=${order.access_key}`} className="btn-secondary">Baixar PDF</a>
        <PrintButton />
        <Link href={`/e/${event.slug}`} className="btn-ghost">Página do evento</Link>
      </div>
      <p className="text-xs text-zinc-500 print:hidden">Guarde este link: ele é o seu acesso ao comprovante.</p>
    </div>
  );
}
