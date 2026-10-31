"use client";

import { useState, useTransition } from "react";
import { MaskedInput } from "@/components/masked-input";
import { DateInput } from "@/components/date-input";
import { FormMessage } from "@/components/ui";
import { money } from "@/lib/format";
import type { ActionState, Question } from "@/lib/types";
import type { PublicItem } from "@/lib/events";
import { createRegistration, type RegistrationPayload } from "./actions";

type Choice = { checked: boolean; option: string; quantity: number };
type Person = { name: string; birth_date: string; answers: Record<string, string>; choices: Record<string, Choice> };

const emptyPerson = (): Person => ({ name: "", birth_date: "", answers: {}, choices: {} });

export function RegistrationForm({
  eventId,
  items,
  questions,
  needsBirthDate,
  requireCpf,
}: {
  eventId: string;
  items: PublicItem[];
  questions: Question[];
  needsBirthDate: boolean;
  requireCpf: boolean;
}) {
  const [people, setPeople] = useState<Person[]>([emptyPerson()]);
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, startTransition] = useTransition();
  const registration = items.find((i) => i.is_registration)!;
  const extras = items.filter((i) => !i.is_registration);
  const nameOf = new Map(items.map((i) => [i.id, i.name]));

  const has = (p: Person, itemId: string) => itemId === registration.id || Boolean(p.choices[itemId]?.checked);

  function update(index: number, fn: (p: Person) => Person) {
    setPeople((list) => list.map((p, i) => (i === index ? fn(p) : p)));
  }

  function toggle(index: number, item: PublicItem, checked: boolean) {
    update(index, (p) => {
      const choices = { ...p.choices, [item.id]: { ...(p.choices[item.id] ?? { option: "", quantity: 1 }), checked } };
      // Desmarcar um item desmarca os que dependem dele.
      if (!checked) {
        let changed = true;
        while (changed) {
          changed = false;
          for (const dep of extras) {
            if (dep.requires_item_id && choices[dep.id]?.checked && !(dep.requires_item_id === registration.id || choices[dep.requires_item_id]?.checked)) {
              choices[dep.id] = { ...choices[dep.id], checked: false };
              changed = true;
            }
          }
        }
      }
      return { ...p, choices };
    });
  }

  const personTotal = (p: Person) =>
    registration.price + extras.reduce((s, i) => s + (p.choices[i.id]?.checked ? i.price * (p.choices[i.id].quantity || 1) : 0), 0);
  const total = people.reduce((s, p) => s + personTotal(p), 0);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload: RegistrationPayload = {
      buyer: {
        name: String(form.get("buyer_name") ?? ""),
        email: String(form.get("buyer_email") ?? ""),
        phone: String(form.get("buyer_phone") ?? ""),
        cpf: String(form.get("buyer_cpf") ?? ""),
      },
      attendees: people.map((p) => ({
        name: p.name,
        birth_date: p.birth_date,
        answers: p.answers,
        items: extras
          .filter((i) => p.choices[i.id]?.checked)
          .map((i) => ({ item_id: i.id, option: p.choices[i.id].option || null, quantity: p.choices[i.id].quantity || 1 })),
      })),
    };
    setState(undefined);
    startTransition(async () => {
      const result = await createRegistration(eventId, payload);
      if (result) setState(result);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="font-semibold">Responsável pela inscrição</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="buyer_name">Nome completo</label>
            <input className="input" id="buyer_name" name="buyer_name" required minLength={3} autoComplete="name" />
          </div>
          <div>
            <label className="label" htmlFor="buyer_email">E-mail</label>
            <input className="input" id="buyer_email" name="buyer_email" type="email" required autoComplete="email" />
            <p className="hint">O comprovante será enviado para este e-mail.</p>
          </div>
          <div>
            <label className="label" htmlFor="buyer_phone">WhatsApp</label>
            <MaskedInput mask="phone" id="buyer_phone" name="buyer_phone" required />
          </div>
          <div>
            <label className="label" htmlFor="buyer_cpf">CPF {requireCpf ? "" : "(opcional)"}</label>
            <MaskedInput mask="cpf" id="buyer_cpf" name="buyer_cpf" required={requireCpf} />
          </div>
        </div>
      </section>

      {people.map((p, index) => (
        <section key={index} className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Participante {index + 1}</h2>
            {people.length > 1 && (
              <button type="button" className="btn-ghost text-red-600" onClick={() => setPeople((l) => l.filter((_, i) => i !== index))}>
                Remover
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div>
              <label className="label">Nome completo</label>
              <input className="input" required minLength={3} value={p.name} onChange={(e) => update(index, (x) => ({ ...x, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Data de nascimento</label>
              <DateInput
                required={needsBirthDate}
                value={p.birth_date}
                onChange={(e) => update(index, (x) => ({ ...x, birth_date: e.target.value }))}
              />
            </div>
          </div>

          {extras.length > 0 && (
            <div className="space-y-2">
              <p className="label">Itens</p>
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
                <span>✓ {registration.name}</span>
                <span className="font-medium">{money(registration.price)}</span>
              </div>
              {extras.map((item) => {
                const c = p.choices[item.id];
                const blocked = Boolean(item.requires_item_id) && !has(p, item.requires_item_id!);
                const soldOut = item.remaining === 0;
                return (
                  <div key={item.id} className={`rounded-lg border border-zinc-200 px-3 py-2 text-sm ${blocked || soldOut ? "opacity-60" : ""}`}>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        disabled={blocked || soldOut}
                        checked={Boolean(c?.checked)}
                        onChange={(e) => toggle(index, item, e.target.checked)}
                      />
                      <span className="flex-1">
                        {item.name}
                        {item.description && <span className="block text-xs text-zinc-500">{item.description}</span>}
                        {blocked && <span className="block text-xs text-amber-700">Disponível para quem escolher {nameOf.get(item.requires_item_id!)}</span>}
                        {soldOut && <span className="block text-xs text-red-600">Esgotado</span>}
                      </span>
                      <span className="font-medium">{money(item.price)}</span>
                    </label>
                    {c?.checked && (item.options.length > 0 || item.max_per_person !== 1) && (
                      <div className="mt-2 flex flex-wrap gap-3 pl-7">
                        {item.options.length > 0 && (
                          <select
                            className="input w-auto"
                            required
                            value={c.option}
                            onChange={(e) => update(index, (x) => ({ ...x, choices: { ...x.choices, [item.id]: { ...c, option: e.target.value } } }))}
                          >
                            <option value="">Escolha...</option>
                            {item.options.map((o) => <option key={o}>{o}</option>)}
                          </select>
                        )}
                        {item.max_per_person !== 1 && (
                          <label className="flex items-center gap-2">
                            Quantidade
                            <input
                              className="input w-20"
                              type="number"
                              min={1}
                              max={item.max_per_person ?? undefined}
                              value={c.quantity}
                              onChange={(e) => update(index, (x) => ({ ...x, choices: { ...x.choices, [item.id]: { ...c, quantity: Number(e.target.value) || 1 } } }))}
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {questions.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {questions.map((q) => (
                <QuestionField
                  key={q.id}
                  q={q}
                  value={p.answers[q.id] ?? ""}
                  onChange={(v) => update(index, (x) => ({ ...x, answers: { ...x.answers, [q.id]: v } }))}
                />
              ))}
            </div>
          )}
          <p className="text-right text-sm text-zinc-600">Subtotal: <b>{money(personTotal(p))}</b></p>
        </section>
      ))}

      <button type="button" className="btn-secondary w-full" onClick={() => setPeople((l) => [...l, emptyPerson()])}>
        + Adicionar outra pessoa
      </button>

      <div className="card sticky bottom-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500">{people.length} pessoa(s)</p>
          <p className="text-2xl font-bold">{money(total)}</p>
        </div>
        <div className="w-full sm:w-auto">
          <FormMessage state={state} />
        </div>
        <button type="submit" className="btn-primary px-6 py-3 text-base" disabled={pending}>
          {pending ? "Enviando..." : total > 0 ? "Continuar para o pagamento" : "Confirmar inscrição"}
        </button>
      </div>
    </form>
  );
}

function QuestionField({ q, value, onChange }: { q: Question; value: string; onChange: (v: string) => void }) {
  const label = (
    <label className="label">
      {q.label} {!q.required && <span className="font-normal text-zinc-400">(opcional)</span>}
    </label>
  );
  const help = q.help && <p className="hint">{q.help}</p>;
  if (q.type === "textarea") {
    return (
      <div className="sm:col-span-2">
        {label}
        <textarea className="input" rows={3} required={q.required} value={value} onChange={(e) => onChange(e.target.value)} />
        {help}
      </div>
    );
  }
  if (q.type === "select" || q.type === "yesno") {
    const options = q.type === "yesno" ? ["Sim", "Não"] : q.options;
    return (
      <div>
        {label}
        <select className="input" required={q.required} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecione...</option>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        {help}
      </div>
    );
  }
  if (q.type === "phone" || q.type === "cpf" || q.type === "cep") {
    return (
      <div>
        {label}
        <MaskedInput mask={q.type} required={q.required} value={value} onValueChange={onChange} />
        {help}
      </div>
    );
  }
  if (q.type === "date") {
    return (
      <div>
        {label}
        <DateInput required={q.required} value={value} onChange={(e) => onChange(e.target.value)} />
        {help}
      </div>
    );
  }
  return (
    <div>
      {label}
      <input
        className="input"
        type={q.type === "number" ? "number" : "text"}
        required={q.required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {help}
    </div>
  );
}
