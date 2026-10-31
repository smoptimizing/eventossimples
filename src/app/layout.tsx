import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { SITE_NAME } from "@/lib/site";
import { getSessionUser } from "@/lib/auth";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  description: "Inscrições online para acampamentos, retiros, conferências e eventos.",
  icons: { icon: "/icon.svg" },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { user } = await getSessionUser();
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/90 backdrop-blur print:hidden">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
            <Link href="/" className="mr-auto flex items-center gap-2 font-bold text-brand-800">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">✦</span>
              <span className="hidden sm:inline">{SITE_NAME}</span>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/comprovante" className="btn-ghost px-3">Meu comprovante</Link>
              {user ? (
                <>
                  <Link href="/painel" className="btn-ghost px-3">Painel</Link>
                  <form action="/auth/sair" method="post">
                    <button className="btn-ghost px-3 text-zinc-500">Sair</button>
                  </form>
                </>
              ) : (
                <Link href="/entrar" className="btn-primary">Organizador</Link>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-zinc-200 bg-white py-6 text-center text-xs text-zinc-500 print:hidden">
          {SITE_NAME} · Inscrições online para eventos
        </footer>
      </body>
    </html>
  );
}
