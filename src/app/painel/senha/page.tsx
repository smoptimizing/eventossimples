import { requireUser } from "@/lib/auth";
import { ActionForm } from "@/components/ui";
import { changePassword } from "../actions";

export const metadata = { title: "Nova senha" };

export default async function SenhaPage() {
  await requireUser("/painel/senha");
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-6">
        <h1 className="mb-4 text-2xl font-bold">Nova senha</h1>
        <ActionForm action={changePassword} submitLabel="Salvar senha">
          <div>
            <label className="label" htmlFor="password">Nova senha</label>
            <input className="input" id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
