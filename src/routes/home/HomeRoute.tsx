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
  const dateline = dateFormatter.format(new Date()).toUpperCase()
  const markets = marketsCovered(holdings)

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
        <header className="reveal" style={{ '--i': 0 } as React.CSSProperties}>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-5xl font-medium leading-none tracking-tight text-ink sm:text-6xl">
                {import.meta.env.VITE_APP_TITLE}
              </h1>
              <p className="mt-4 text-sm text-ink-muted">
                Edge-only. Your holdings never leave this device.
              </p>
            </div>
            <div className="text-right">
              <p className="smallcaps text-[0.7rem] text-ink-muted">
                As of {dateline} <span className="text-ink-soft">·</span> {markets} Portfolio
              </p>
              <p className="smallcaps mt-1 text-[0.7rem] text-ink-soft">
                {holdings.length} {holdings.length === 1 ? 'Holding' : 'Holdings'}
              </p>
              <Link
                to="/import"
                className="smallcaps mt-4 inline-block border-b border-ink pb-0.5 text-[0.7rem] font-medium text-ink hover:text-oxblood hover:border-oxblood"
              >
                Import more
              </Link>
            </div>
          </div>
          <div className="rule-double mt-8" />
        </header>

        <section className="mt-10">
          <HoldingsTable holdings={holdings} />
        </section>

        <footer
          className="reveal mt-16 border-t border-rule pt-6 text-[0.7rem] text-ink-soft smallcaps"
          style={{ '--i': Math.min(holdings.length + 2, 24) } as React.CSSProperties}
        >
          <p>
            Filed from this browser <span className="text-ink-soft">·</span> No backend{' '}
            <span className="text-ink-soft">·</span> No telemetry
          </p>
        </footer>
      </div>
    </main>
  )
}

function marketsCovered(holdings: CanonicalHolding[]): string {
  const sources = new Set(holdings.map((h) => h.source))
  const parts: string[] = []
  if (sources.has('groww')) parts.push('IN')
  if (sources.has('vested')) parts.push('US')
  return parts.length ? parts.join('+') : 'IN+US'
}
