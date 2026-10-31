import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 text-zinc-600">O link pode estar incompleto ou o evento não está mais disponível.</p>
      <Link href="/" className="btn-primary mt-6">Ir para o início</Link>
    </div>
  );
}
