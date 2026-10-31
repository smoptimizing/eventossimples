export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-12">
      <div className="card p-6 sm:p-8">{children}</div>
    </div>
  );
}
