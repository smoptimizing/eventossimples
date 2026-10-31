"use client";

import { FormMessage, SubmitButton, useFormAction } from "@/components/ui";
import { createEvent } from "./actions";

/** Cria o evento só com o nome; o resto é preenchido na página do evento. */
export function NewEventForm() {
  const { state, pending, onSubmit } = useFormAction(createEvent);
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <label className="label" htmlFor="title">Nome do evento</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className="input" id="title" name="title" required minLength={2} placeholder="Ex.: Acampamento de Jovens IBC 2027" />
        <SubmitButton pending={pending} className="btn-primary shrink-0" pendingText="Criando...">Criar evento</SubmitButton>
      </div>
      <p className="hint">O nome precisa ser único na plataforma. Datas, vagas e os demais dados você preenche em seguida.</p>
      <FormMessage state={state} />
    </form>
  );
}
