import { Link, useLoaderData } from 'react-router-dom'
import type { CanonicalHolding } from '../storage/holdings'
import { HoldingsTable } from '../components/HoldingsTable'

export function HoldingsRoute() {
  const holdings = useLoaderData() as CanonicalHolding[]

  if (holdings.length === 0) {
    return (
      <div className="space-y-6">
        <PageHead title="Holdings" caption="Nothing imported yet" />
        <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-16 text-center">
          <p className="font-sans text-base text-bone-200">
            Import a broker file from Settings to see your positions here.
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

  const inr = holdings.filter((h) => h.currency === 'INR').length
  const usd = holdings.filter((h) => h.currency === 'USD').length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <PageHead title="Holdings" caption={`${holdings.length} positions · ${inr} INR · ${usd} USD`} />
        <Link
          to="/settings"
          className="inline-flex w-fit items-center gap-2 border border-bone-100/15 px-3 py-1.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
        >
          + Import
        </Link>
      </div>
      <HoldingsTable holdings={holdings} />
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
