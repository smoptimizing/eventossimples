"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["", "Dashboard"],
  ["/inscricoes", "Inscrições"],
  ["/editar", "Dados do evento"],
  ["/itens", "Itens"],
  ["/lotes", "Lotes"],
  ["/formulario", "Formulário"],
];

export function Tabs({ id }: { id: string }) {
  const path = usePathname();
  const base = `/painel/eventos/${id}`;
  return (
    <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-zinc-200 px-4 print:hidden">
      {TABS.map(([suffix, label]) => {
        const href = base + suffix;
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            className={`border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${active ? "border-brand-600 text-brand-700" : "border-transparent text-zinc-600 hover:text-zinc-900"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
