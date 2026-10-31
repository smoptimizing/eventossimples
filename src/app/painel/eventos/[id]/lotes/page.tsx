import { requireOwnEvent } from "@/lib/auth";
import { ActionForm, ConfirmButton } from "@/components/ui";
import { DateTimeInput } from "@/components/date-input";
import { dateTime, isoToLocalInput, money } from "@/lib/format";
import type { Item, Lot } from "@/lib/types";
import { deleteLot, saveLot } from "../../../actions";

export const metadata = { title: "Lotes" };

type LotWithPrices = Lot & { lot_prices: { item_id: string; price: number }[] };

function LotFields({ lot, items, nextPosition }: { lot?: LotWithPrices; items: Item[]; nextPosition: number }) {
  const priceOf = new Map((lot?.lot_prices ?? []).map((p) => [p.item_id, p.price]));
  return (
    <>
      {lot && <input type="hidden" name="id" value={lot.id} />}
      <div>
        <label className="label">Nome</label>
        <input className="input" name="name" required defaultValue={lot?.name ?? ""} placeholder="Ex.: 1º lote" />
      </div>
      <div>
        <label className="label">Ordem</label>
        <input className="input" name="position" type="number" min={1} defaultValue={lot?.position ?? nextPosition} />
      </div>
      <div>
        <label className="label">Início</label>
        <DateTimeInput name="starts_at" defaultValue={isoToLocalInput(lot?.starts_at)} />
      </div>
      <div>
        <label className="label">Fim</label>
        <DateTimeInput name="ends_at" defaultValue={isoToLocalInput(lot?.ends_at)} />
      </div>
      <div>
        <label className="label">Quantidade de inscrições</label>
        <input className="input" name="quantity" type="number" min={1} defaultValue={lot?.quantity ?? ""} />
        <p className="hint">Ao esgotar, passa para o próximo lote.</p>
      </div>
      <div className="sm:col-span-2">
        <p className="label">Preços neste lote (vazio = preço padrão do item)</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {items.map((i) => (
            <label key={i.id} className="flex items-center gap-2 text-sm">
              <span className="w-40 truncate">{i.name}</span>
              <input
                className="input"
                name={`price_${i.id}`}
                inputMode="decimal"
                placeholder={money(i.price)}
                defaultValue={priceOf.has(i.id) ? String(priceOf.get(i.id)).replace(".", ",") : ""}
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

export default async function LotesPage({ params }: PageProps<"/painel/eventos/[id]/lotes">) {
  const { id } = await params;
  const { supabase, event } = await requireOwnEvent(id);
  const [{ data: lotData }, { data: itemData }, { data: av }] = await Promise.all([
    supabase.from("lots").select("*, lot_prices(item_id, price)").eq("event_id", id).order("position"),
    supabase.from("items").select("*").eq("event_id", id).order("is_registration", { ascending: false }).order("position"),
    supabase.rpc("event_availability", { p_event: id }),
  ]);
  const lots = (lotData ?? []) as LotWithPrices[];
  const items = (itemData ?? []) as Item[];
  const currentLot = (av as { lot: { id: string } | null } | null)?.lot?.id;
  const nameOf = new Map(items.map((i) => [i.id, i.name]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Sem lotes, valem os preços dos itens. Com lotes, vale o <b>primeiro lote (pela ordem)</b> que estiver dentro do período e ainda tiver vagas;
        se nenhum estiver vigente, as inscrições ficam fechadas.
      </p>
      <p className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Período de inscrições: {event.reg_opens_at ? `de ${dateTime(event.reg_opens_at)}` : "a partir da publicação"}{" "}
        {event.reg_closes_at
          ? `até ${dateTime(event.reg_closes_at)}`
          : event.starts_at
            ? `até o início do evento (${dateTime(event.starts_at)})`
            : "(defina as datas em Dados do evento)"}
        . As datas dos lotes precisam ficar dentro desse período.
      </p>
      {lots.map((lot) => (
        <details key={lot.id} className="card">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3">
            <span className="font-semibold">{lot.position}. {lot.name}</span>
            {lot.id === currentLot && <span className="badge bg-emerald-100 text-emerald-800">vigente</span>}
            <span className="text-xs text-zinc-500">
              {[lot.starts_at && `de ${dateTime(lot.starts_at)}`, lot.ends_at && `até ${dateTime(lot.ends_at)}`, lot.quantity && `${lot.quantity} inscrições`]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span className="ml-auto text-sm text-zinc-600">
              {lot.lot_prices.map((p) => `${nameOf.get(p.item_id)}: ${money(p.price)}`).join(" · ")}
            </span>
          </summary>
          <ActionForm action={saveLot.bind(null, id)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <LotFields lot={lot} items={items} nextPosition={lots.length + 1} />
          </ActionForm>
          <form action={deleteLot.bind(null, id, lot.id)} className="mt-2 text-right">
            <ConfirmButton message="Excluir este lote? As inscrições já feitas mantêm o valor pago." className="btn-ghost text-red-600">Excluir</ConfirmButton>
          </form>
        </details>
      ))}
      <div className="card">
        <h2 className="mb-4 font-semibold">Novo lote</h2>
        <ActionForm action={saveLot.bind(null, id)} className="grid gap-4 sm:grid-cols-2" submitLabel="Adicionar lote" resetOnSuccess>
          <LotFields items={items} nextPosition={lots.length + 1} />
        </ActionForm>
      </div>
    </div>
  );
}
