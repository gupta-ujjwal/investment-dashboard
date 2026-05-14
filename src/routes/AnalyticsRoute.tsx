import { Link, useLoaderData } from 'react-router-dom'
import type { CanonicalHolding } from '../storage/holdings'
import { formatMoney } from '../lib/format'

export function AnalyticsRoute() {
  const holdings = useLoaderData() as CanonicalHolding[]

  if (holdings.length === 0) {
    return <EmptyState />
  }

  const totals = aggregate(holdings)

  return (
    <div className="space-y-10">
      <PageHead title="Analytics" caption="Portfolio snapshot, on-device" />

      <section
        aria-label="Key figures"
        className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4"
      >
        <Kpi label="Holdings" value={String(holdings.length)} sub="positions" />
        <Kpi
          label="India · INR"
          value={formatMoney(totals.inrCost, 'INR')}
          sub={`${totals.inrCount} positions`}
        />
        <Kpi
          label="US · USD"
          value={formatMoney(totals.usdCost, 'USD')}
          sub={`${totals.usdCount} positions`}
        />
        <Kpi
          label="Brokers"
          value={String(totals.brokers.size)}
          sub={[...totals.brokers].join(' · ') || '—'}
        />
      </section>

      <section aria-label="Charts">
        <div className="flex items-end justify-between">
          <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
            Charts
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
            Coming online
          </span>
        </div>
        <div className="mt-4 grid gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 lg:grid-cols-3">
          <ChartFrame title="Allocation" hint="By market · by asset class" chip="donut" />
          <ChartFrame title="Performance" hint="Cost basis vs. live value over time" chip="line" />
          <ChartFrame title="P&L" hint="Per-position realised & unrealised" chip="bars" />
        </div>
      </section>
    </div>
  )
}

function PageHead({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="font-sans text-2xl font-semibold tracking-tight text-bone-50 sm:text-3xl">
        {title}
      </h1>
      <p className="font-sans text-sm text-bone-400">{caption}</p>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-ink-900 px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.18em] text-bone-400">
        <span className="h-px w-3 bg-tick-400/60" />
        {label}
      </div>
      <div className="mt-3 break-words font-display text-xl leading-tight tracking-tight text-bone-50 tabular-nums lg:text-3xl xl:text-4xl">
        {value}
      </div>
      <div className="mt-2 font-mono text-[11px] text-bone-400">{sub}</div>
    </div>
  )
}

function ChartFrame({
  title,
  hint,
  chip,
}: {
  title: string
  hint: string
  chip: string
}) {
  return (
    <div className="group relative flex min-h-[220px] flex-col justify-between bg-ink-900 p-6 transition hover:bg-ink-850">
      <div className="flex items-start justify-between">
        <h3 className="font-sans text-base font-semibold tracking-tight text-bone-100">
          {title}
        </h3>
        <span className="border border-bone-100/15 bg-ink-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
          {chip}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="relative my-6 h-20 w-full opacity-60"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(242, 235, 219, 0.08) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(242, 235, 219, 0.06) 1px, transparent 1px)
          `,
          backgroundSize: '12px 100%, 100% 10px',
        }}
      >
        <svg
          viewBox="0 0 200 60"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
        >
          <path
            d="M0 45 L25 38 L50 42 L75 28 L100 32 L125 20 L150 26 L175 14 L200 18"
            fill="none"
            stroke="var(--color-tick-400)"
            strokeWidth="1.2"
            opacity="0.7"
          />
        </svg>
      </div>
      <p className="font-sans text-xs text-bone-400">{hint}</p>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="space-y-6">
      <PageHead title="Analytics" caption="No holdings on file yet" />
      <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
        <p className="font-sans text-base text-bone-200">
          Once you import your first file, this page will fill with charts and totals.
        </p>
        <Link
          to="/settings"
          className="mt-6 inline-flex items-center gap-2 border border-tick-400 bg-tick-400 px-5 py-2.5 font-sans text-[12px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200"
        >
          Go to Settings →
        </Link>
      </div>
    </div>
  )
}

function aggregate(holdings: CanonicalHolding[]) {
  const totals: {
    inrCost: number
    usdCost: number
    inrCount: number
    usdCount: number
    brokers: Set<string>
  } = { inrCost: 0, usdCost: 0, inrCount: 0, usdCount: 0, brokers: new Set() }
  for (const h of holdings) {
    const cost = h.quantity * h.avgBuyPrice
    if (h.currency === 'INR') {
      totals.inrCost += cost
      totals.inrCount += 1
    } else {
      totals.usdCost += cost
      totals.usdCount += 1
    }
    totals.brokers.add(h.source === 'vested' ? 'Vested' : 'Groww')
  }
  return totals
}
