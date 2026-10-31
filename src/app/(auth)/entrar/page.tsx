import { SignInForm } from "../auth-forms";

export const metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const { next, erro } = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Área do organizador</h1>
      <p className="mb-6 text-sm text-zinc-500">Entre para gerenciar seus eventos.</p>
      {erro && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">O link expirou ou é inválido. Tente novamente.</p>}
      <SignInForm next={typeof next === "string" ? next : "/painel"} />
    </>
  );
}
