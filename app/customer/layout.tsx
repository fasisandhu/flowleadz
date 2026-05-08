export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white p-4">
        <h1 className="font-semibold">Customer</h1>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
