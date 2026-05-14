import { Link, useLoaderData } from 'react-router-dom'
import type { CanonicalHolding } from '../../storage/holdings'
import { HoldingsTable } from './HoldingsTable'

export function HomeRoute() {
  const holdings = useLoaderData() as CanonicalHolding[]

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex items-baseline justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {import.meta.env.VITE_APP_TITLE}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {holdings.length} holdings &middot; edge-only &middot; nothing leaves your device
            </p>
          </div>
          <Link
            to="/import"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            Import more
          </Link>
        </header>

        <HoldingsTable holdings={holdings} />
      </div>
    </main>
  )
}
