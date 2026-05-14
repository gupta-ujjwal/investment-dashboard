import { Link, useLoaderData } from 'react-router-dom'
import type { CanonicalHolding } from '../../storage/holdings'
import { HoldingsTable } from './HoldingsTable'

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function HomeRoute() {
  const holdings = useLoaderData() as CanonicalHolding[]
  const date = dateFormatter.format(new Date())

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <header className="reveal" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-5xl font-normal italic leading-none tracking-tight text-ink sm:text-6xl">
                {import.meta.env.VITE_APP_TITLE}
              </h1>
              <p className="mt-3 font-mono text-xs text-ink-muted">
                {date}
                <span className="mx-2 text-ink-soft">·</span>
                {holdings.length} {holdings.length === 1 ? 'holding' : 'holdings'}
              </p>
            </div>
            <Link to="/import" className="link-brass text-sm">
              Import more
            </Link>
          </div>
          <div className="rule-double mt-8" />
        </header>

        <section className="mt-10">
          <HoldingsTable holdings={holdings} />
        </section>

        <footer
          className="reveal mt-20 border-t border-rule pt-6 text-xs italic text-ink-soft"
          style={{ '--i': Math.min(holdings.length + 2, 24) } as React.CSSProperties}
        >
          <p>Filed from this browser. No backend. No telemetry.</p>
        </footer>
      </div>
    </main>
  )
}
