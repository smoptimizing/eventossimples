import { requireOwnEvent } from "@/lib/auth";
import { ActionForm, ConfirmButton } from "@/components/ui";
import { money } from "@/lib/format";
import type { Item } from "@/lib/types";
import { deleteItem, saveItem } from "../../../actions";

export const metadata = { title: "Itens" };

/** true se `o` é o próprio item ou depende dele (direta ou indiretamente): escolher criaria um ciclo. */
function dependsOn(o: Item, itemId: string, all: Item[]) {
  const byId = new Map(all.map((i) => [i.id, i]));
  for (let cur: Item | undefined = o, n = 0; cur && n < all.length; cur = byId.get(cur.requires_item_id ?? ""), n++) {
    if (cur.id === itemId) return true;
  }
  return false;
}

function ItemFields({ item, others }: { item?: Item; others: Item[] }) {
  const reg = item?.is_registration;
  return (
    <>
      {item && <input type="hidden" name="id" value={item.id} />}
      {reg && <input type="hidden" name="is_registration" value="1" />}
      <div>
        <label className="label">Nome</label>
        <input className="input" name="name" required defaultValue={item?.name ?? ""} placeholder="Ex.: Ônibus, Camisa, Crédito na cantina" />
      </div>
      <div>
        <label className="label">Preço (R$)</label>
        <input className="input" name="price" inputMode="decimal" defaultValue={item ? String(item.price).replace(".", ",") : ""} placeholder="0,00" />
        <p className="hint">Preço padrão; cada lote pode ter outro valor.</p>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Descrição</label>
        <input className="input" name="description" defaultValue={item?.description ?? ""} />
      </div>
      {!reg && (
        <>
          <div>
            <label className="label">Opções</label>
            <input className="input" name="options" defaultValue={item?.options.join("; ") ?? ""} placeholder="Ex.: P; M; G; GG" />
            <p className="hint">Separadas por ponto e vírgula (;). A pessoa escolhe uma (ex.: tamanho).</p>
          </div>
          <div>
            <label className="label">Só pode comprar quem escolher</label>
            <select className="input" name="requires_item_id" defaultValue={item?.requires_item_id ?? ""}>
              <option value="">— sem dependência —</option>
              {others.filter((o) => !item || !dependsOn(o, item.id, others)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Máximo por pessoa</label>
            <input className="input" name="max_per_person" type="number" min={1} defaultValue={item ? (item.max_per_person ?? "") : 1} />
            <p className="hint">Vazio: sem limite.</p>
          </div>
          <div>
            <label className="label">Estoque</label>
            <input className="input" name="stock" type="number" min={0} defaultValue={item?.stock ?? ""} />
            <p className="hint">Vazio: sem limite.</p>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="active" defaultChecked={item?.active ?? true} /> Disponível para venda
          </label>
        </>
      )}
    </>
  );
}

export default async function ItensPage({ params }: PageProps<"/painel/eventos/[id]/itens">) {
  const { id } = await params;
  const { supabase } = await requireOwnEvent(id);
  const { data } = await supabase.from("items").select("*").eq("event_id", id).order("is_registration", { ascending: false }).order("position");
  const items = (data ?? []) as Item[];
  const nameOf = new Map(items.map((i) => [i.id, i.name]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        A <b>inscrição</b> é obrigatória e incluída para cada pessoa. Os demais itens são opcionais e escolhidos por pessoa.
      </p>
      {items.map((item) => (
        <details key={item.id} className="card">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3">
            <span className="font-semibold">{item.name}</span>
            {item.is_registration && <span className="badge bg-brand-100 text-brand-800">obrigatório</span>}
            {!item.active && <span className="badge bg-zinc-200 text-zinc-700">indisponível</span>}
            {item.requires_item_id && <span className="text-xs text-zinc-500">exige {nameOf.get(item.requires_item_id)}</span>}
            <span className="ml-auto font-medium">{money(item.price)}</span>
          </summary>
          <ActionForm action={saveItem.bind(null, id)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <ItemFields item={item} others={items} />
          </ActionForm>
          {!item.is_registration && (
            <form action={deleteItem.bind(null, id, item.id)} className="mt-2 text-right">
              <ConfirmButton message="Excluir este item? Se já foi vendido, ele apenas fica indisponível." className="btn-ghost text-red-600">
                Excluir
              </ConfirmButton>
            </form>
          )}
        </details>
      ))}

      <div className="card">
        <h2 className="mb-4 font-semibold">Novo item</h2>
        <ActionForm action={saveItem.bind(null, id)} className="grid gap-4 sm:grid-cols-2" submitLabel="Adicionar item" resetOnSuccess>
          <ItemFields others={items} />
        </ActionForm>
      </div>
    </div>
  );
}
