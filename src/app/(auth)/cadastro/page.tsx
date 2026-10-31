import { SignUpForm } from "../auth-forms";

export const metadata = { title: "Criar conta" };

export default function CadastroPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Cadastre sua organização</h1>
      <p className="mb-6 text-sm text-zinc-500">Crie eventos e receba inscrições e pagamentos online.</p>
      <SignUpForm />
    </>
  );
}
