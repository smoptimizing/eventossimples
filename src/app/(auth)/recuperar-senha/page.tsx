import { ResetForm } from "../auth-forms";

export const metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Recuperar senha</h1>
      <ResetForm />
    </>
  );
}
