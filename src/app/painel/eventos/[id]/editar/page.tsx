import { requireOwnEvent } from "@/lib/auth";
import { ActionForm, ConfirmButton } from "@/components/ui";
import { DateTimeInput } from "@/components/date-input";
import { isoToLocalInput } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { deleteEvent, saveEvent } from "../../../actions";

export const metadata = { title: "Dados do evento" };

export default async function EditarEventoPage({ params }: PageProps<"/painel/eventos/[id]/editar">) {
  const { id } = await params;
  const { event: e } = await requireOwnEvent(id);

  return (
    <div className="space-y-6">
      <ActionForm action={saveEvent.bind(null, id)} className="card grid gap-4 sm:grid-cols-2" submitLabel="Salvar evento">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="title">Nome do evento</label>
          <input className="input" id="title" name="title" required defaultValue={e.title} />
        </div>
        <div>
          <label className="label" htmlFor="theme">Tema</label>
          <input className="input" id="theme" name="theme" defaultValue={e.theme ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="speaker">Preletor(es)</label>
          <input className="input" id="speaker" name="speaker" defaultValue={e.speaker ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">Descrição</label>
          <textarea className="input" id="description" name="description" rows={5} defaultValue={e.description ?? ""} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="location">Local</label>
          <input className="input" id="location" name="location" defaultValue={e.location ?? ""} placeholder="Ex.: Sítio Recanto, Guaramiranga - CE" />
        </div>
        <div>
          <label className="label" htmlFor="starts_at">Início do evento</label>
          <DateTimeInput id="starts_at" name="starts_at" required={e.status !== "draft"} defaultValue={isoToLocalInput(e.starts_at)} />
          <p className="hint">Obrigatória para publicar.</p>
        </div>
        <div>
          <label className="label" htmlFor="ends_at">Fim do evento</label>
          <DateTimeInput id="ends_at" name="ends_at" defaultValue={isoToLocalInput(e.ends_at)} />
        </div>
        <div>
          <label className="label" htmlFor="reg_opens_at">Inscrições abrem em</label>
          <DateTimeInput id="reg_opens_at" name="reg_opens_at" defaultValue={isoToLocalInput(e.reg_opens_at)} />
          <p className="hint">Vazio: abre ao publicar.</p>
        </div>
        <div>
          <label className="label" htmlFor="reg_closes_at">Inscrições fecham em</label>
          <DateTimeInput id="reg_closes_at" name="reg_closes_at" defaultValue={isoToLocalInput(e.reg_closes_at)} />
          <p className="hint">Vazio: até encerrar manualmente ou esgotar.</p>
        </div>
        <div>
          <label className="label" htmlFor="min_age">Idade mínima</label>
          <input className="input" id="min_age" name="min_age" type="number" min={0} max={120} defaultValue={e.min_age ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="max_age">Idade máxima</label>
          <input className="input" id="max_age" name="max_age" type="number" min={0} max={120} defaultValue={e.max_age ?? ""} />
          <p className="hint">Idade calculada na data de início do evento.</p>
        </div>
        <div>
          <label className="label" htmlFor="capacity">Número de vagas</label>
          <input className="input" id="capacity" name="capacity" type="number" min={1} defaultValue={e.capacity ?? ""} />
          <p className="hint">Vazio: sem limite.</p>
        </div>
        <div>
          <label className="label" htmlFor="order_expiry_hours">Prazo para pagar (horas)</label>
          <input className="input" id="order_expiry_hours" name="order_expiry_hours" type="number" min={1} max={720} defaultValue={e.order_expiry_hours} />
          <p className="hint">Depois disso a vaga reservada é liberada.</p>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="slug">Endereço da página</label>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-zinc-500">{siteUrl("/e/")}</span>
            <input className="input" id="slug" name="slug" required defaultValue={e.slug} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="art">Arte do evento</label>
          {e.art_url && (
            <div className="mb-2 flex items-end gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.art_url} alt="" className="h-28 rounded-lg border border-zinc-200" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="remove_art" /> Remover arte</label>
            </div>
          )}
          <input className="input" id="art" name="art" type="file" accept="image/jpeg,image/png,image/webp" />
          <p className="hint">JPG, PNG ou WebP até 4 MB. Formato horizontal (ex.: 1600×900) fica melhor.</p>
        </div>
      </ActionForm>

      {e.status === "draft" && (
        <form action={deleteEvent.bind(null, id)} className="text-right">
          <ConfirmButton message="Excluir este evento? Só é possível enquanto não houver inscrições." className="btn-ghost text-red-600">
            Excluir evento
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
