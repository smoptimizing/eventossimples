import { requireOwnEvent } from "@/lib/auth";
import { ActionForm, ConfirmButton } from "@/components/ui";
import { QUESTION_TYPE_LABEL, type Question } from "@/lib/types";
import { deleteQuestion, saveQuestion } from "../../../actions";

export const metadata = { title: "Formulário" };

function QuestionFields({ q, nextPosition }: { q?: Question; nextPosition: number }) {
  return (
    <>
      {q && <input type="hidden" name="id" value={q.id} />}
      <div className="sm:col-span-2">
        <label className="label">Pergunta</label>
        <input className="input" name="label" required defaultValue={q?.label ?? ""} placeholder="Ex.: Tem alguma alergia ou restrição alimentar?" />
      </div>
      <div>
        <label className="label">Tipo de resposta</label>
        <select className="input" name="type" defaultValue={q?.type ?? "text"}>
          {Object.entries(QUESTION_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Opções (para lista)</label>
        <input className="input" name="options" defaultValue={q?.options.join("; ") ?? ""} placeholder="Ex.: Sim, com restrição; Não; Prefiro não dizer" />
        <p className="hint">Separadas por ponto e vírgula (;). Vírgulas podem fazer parte da opção.</p>
      </div>
      <div>
        <label className="label">Texto de ajuda</label>
        <input className="input" name="help" defaultValue={q?.help ?? ""} />
      </div>
      <div>
        <label className="label">Ordem</label>
        <input className="input" name="position" type="number" min={1} defaultValue={q?.position ?? nextPosition} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="required" defaultChecked={q?.required ?? false} /> Resposta obrigatória
      </label>
    </>
  );
}

export default async function FormularioPage({ params }: PageProps<"/painel/eventos/[id]/formulario">) {
  const { id } = await params;
  const { supabase } = await requireOwnEvent(id);
  const { data } = await supabase.from("questions").select("*").eq("event_id", id).order("position");
  const questions = (data ?? []) as Question[];

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600">
        Nome completo e data de nascimento já são pedidos de cada participante. Acrescente aqui as informações adicionais que você precisa.
      </p>
      {questions.map((q) => (
        <details key={q.id} className="card">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3">
            <span className="font-semibold">{q.position}. {q.label}</span>
            <span className="text-xs text-zinc-500">{QUESTION_TYPE_LABEL[q.type]}</span>
            <span className={`badge ml-auto ${q.required ? "bg-brand-100 text-brand-800" : "bg-zinc-100 text-zinc-600"}`}>
              {q.required ? "obrigatória" : "opcional"}
            </span>
          </summary>
          <ActionForm action={saveQuestion.bind(null, id)} className="mt-4 grid gap-4 sm:grid-cols-2">
            <QuestionFields q={q} nextPosition={questions.length + 1} />
          </ActionForm>
          <form action={deleteQuestion.bind(null, id, q.id)} className="mt-2 text-right">
            <ConfirmButton message="Excluir esta pergunta? As respostas já enviadas deixam de aparecer." className="btn-ghost text-red-600">Excluir</ConfirmButton>
          </form>
        </details>
      ))}
      <div className="card">
        <h2 className="mb-4 font-semibold">Nova pergunta</h2>
        <ActionForm action={saveQuestion.bind(null, id)} className="grid gap-4 sm:grid-cols-2" submitLabel="Adicionar pergunta" resetOnSuccess>
          <QuestionFields nextPosition={questions.length + 1} />
        </ActionForm>
      </div>
    </div>
  );
}
