"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import type { ActionState } from "@/lib/types";

/**
 * Envia um formulário para uma server action sem que o React limpe os campos
 * (evita perder o que foi digitado quando a action retorna um erro).
 */
export function useFormAction(fn: (state: ActionState, form: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(fn, undefined);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => dispatch(data));
  };
  return { state, pending, onSubmit };
}

export function SubmitButton({
  children,
  pending,
  className = "btn-primary",
  pendingText = "Salvando...",
}: {
  children: React.ReactNode;
  pending: boolean;
  className?: string;
  pendingText?: string;
}) {
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>;
  if (state.success) return <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.success}</p>;
  return null;
}

/** Formulário ligado a uma server action que retorna ActionState, com botão e mensagem. */
export function ActionForm({
  action,
  children,
  submitLabel = "Salvar",
  className = "space-y-4",
  buttonClass = "btn-primary",
  resetOnSuccess = false,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  buttonClass?: string;
  resetOnSuccess?: boolean;
}) {
  const { state, pending, onSubmit } = useFormAction(action);
  const ref = useRef<HTMLFormElement>(null);
  // Formulário de inclusão: limpa os campos e some com o aviso de sucesso depois de alguns segundos,
  // para o formulário em branco não parecer um registro já salvo.
  const [dismissed, setDismissed] = useState<ActionState>(undefined);
  useEffect(() => {
    if (!resetOnSuccess || !state?.success) return;
    ref.current?.reset();
    const t = setTimeout(() => setDismissed(state), 4000);
    return () => clearTimeout(t);
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children}
      <FormMessage state={state === dismissed ? undefined : state} />
      <div>
        <SubmitButton pending={pending} className={buttonClass}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** Botão de formulário simples (server action sem retorno) com confirmação opcional. */
export function ConfirmButton({ children, message, className = "btn-secondary" }: { children: React.ReactNode; message: string; className?: string }) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
