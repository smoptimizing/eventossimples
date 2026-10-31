"use client";

import Link from "next/link";
import { FormMessage, SubmitButton, useFormAction } from "@/components/ui";
import { MaskedInput } from "@/components/masked-input";
import { requestPasswordReset, signIn, signUp } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const { state, pending, onSubmit } = useFormAction(signIn);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="btn-primary w-full" pendingText="Entrando...">Entrar</SubmitButton>
      <div className="flex justify-between text-sm">
        <Link className="link" href="/cadastro">Criar conta de organizador</Link>
        <Link className="text-zinc-500 hover:underline" href="/recuperar-senha">Esqueci a senha</Link>
      </div>
    </form>
  );
}

export function SignUpForm() {
  const { state, pending, onSubmit } = useFormAction(signUp);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="org_name">Igreja ou organização</label>
        <input className="input" id="org_name" name="org_name" required placeholder="Ex.: Igreja Batista Central" />
      </div>
      <div>
        <label className="label" htmlFor="phone">WhatsApp</label>
        <MaskedInput mask="phone" id="phone" name="phone" />
      </div>
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="password">Senha</label>
        <input className="input" id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        <p className="hint">Mínimo de 8 caracteres.</p>
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="btn-primary w-full" pendingText="Criando...">Criar conta</SubmitButton>
      <p className="text-center text-sm">Já tem conta? <Link className="link" href="/entrar">Entrar</Link></p>
    </form>
  );
}

export function ResetForm() {
  const { state, pending, onSubmit } = useFormAction(requestPasswordReset);
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">E-mail</label>
        <input className="input" id="email" name="email" type="email" required />
      </div>
      <FormMessage state={state} />
      <SubmitButton pending={pending} className="btn-primary w-full" pendingText="Enviando...">Enviar link</SubmitButton>
      <p className="text-center text-sm"><Link className="link" href="/entrar">Voltar</Link></p>
    </form>
  );
}
