export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">
            Investment Dashboard
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Phase 1 scaffold &middot; India + US equities &middot; edge-only
          </p>
        </header>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium">Holdings</h2>
          <p className="mt-2 text-sm text-slate-500">
            No holdings yet. CSV import and manual entry will land in the next slice.
          </p>
        </section>
      </div>
    </main>
  )
}
