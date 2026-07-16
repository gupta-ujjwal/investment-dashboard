import { useMemo, useState } from 'react'
import { useFetcher, useLoaderData } from 'react-router-dom'
import type { ManualAsset, RiskBand } from '../storage/assets'
import type { CanonicalHolding } from '../storage/holdings'
import type { BudgetMonth } from '../storage/budget'
import type { Settings } from '../storage/settings'
import {
  bulkAllocation,
  emergencyFundStatus,
  riskAllocation,
  type RiskSlice,
} from '../lib/planning'
import { monthlyAverages } from '../lib/budget'
import { effectiveValue, provenanceLabel, type ValueSource } from '../lib/cashflow'
import { formatMoney } from '../lib/format'

type LoaderData = {
  holdings: CanonicalHolding[]
  assets: ManualAsset[]
  settings: Settings
  budgetMonths: BudgetMonth[]
}

export function PlanningRoute() {
  const { holdings, assets, settings, budgetMonths } = useLoaderData() as LoaderData
  const base = settings.baseCurrency

  // W2: the emergency monthly need falls back to average monthly spend from the
  // Budget tab when it isn't set explicitly in Settings (Settings still overrides).
  const avg = useMemo(() => monthlyAverages(budgetMonths), [budgetMonths])
  const emergencyNeed = effectiveValue(settings.emergencyMonthlyNeed, avg?.avgExpenses)

  const emergency = useMemo(
    () => emergencyFundStatus(assets, emergencyNeed.value, settings.emergencyMonths),
    [assets, emergencyNeed.value, settings.emergencyMonths],
  )
  const risk = useMemo(
    () => riskAllocation(holdings, assets, settings.allocationTargets ?? []),
    [holdings, assets, settings.allocationTargets],
  )

  return (
    <div className="space-y-10">
      <PageHead
        title="Planning"
        caption="Emergency fund, risk mix, and a bulk-invest what-if — derived from your tagged assets"
      />

      <EmergencyFundCard
        status={emergency}
        base={base}
        source={emergencyNeed.source}
        avgMonths={avg?.months}
        settings={settings}
      />
      <RiskMixCard
        slices={risk}
        base={base}
        hasTargets={(settings.allocationTargets ?? []).length > 0}
        settings={settings}
      />
      <BulkInvestCard settings={settings} base={base} />
    </div>
  )
}

function EmergencyFundCard({
  status,
  base,
  source,
  avgMonths,
  settings,
}: {
  status: ReturnType<typeof emergencyFundStatus>
  base: Settings['baseCurrency']
  source: ValueSource
  avgMonths: number | undefined
  settings: Settings
}) {
  const funded = status.fundedPct
  const tone = funded === undefined ? 'mute' : funded >= 1 ? 'jade' : funded >= 0.5 ? 'tick' : 'ember'
  const provenance = provenanceLabel(source, avgMonths)
  return (
    <section aria-label="Emergency fund" className="space-y-3">
      <div className="flex items-end justify-between">
        <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
          Emergency fund
        </h3>
        {provenance && status.monthlyNeed !== undefined && (
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
            need · {provenance}
          </span>
        )}
      </div>
      <div className="space-y-4 border border-bone-100/10 bg-ink-900 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-bone-400">
            {formatMoney(status.current, base)}
            {status.target !== undefined && <> of {formatMoney(status.target, base)}</>}
          </span>
          <span className={`font-display text-2xl tabular-nums ${railText[tone]}`}>
            {funded === undefined ? '—' : `${Math.round(funded * 100)}%`}
          </span>
        </div>
        {status.target !== undefined && (
          <div className="h-2 w-full overflow-hidden bg-bone-100/10">
            <div
              className={`h-full ${railBar[tone]}`}
              style={{ width: `${Math.min(100, (funded ?? 0) * 100)}%` }}
            />
          </div>
        )}
        <p className="font-sans text-xs text-bone-400">
          {status.target === undefined ? (
            <>
              Set a monthly need and target months below to track funding. Current emergency-tagged
              assets: {formatMoney(status.current, base)}.
            </>
          ) : (
            <>
              {status.coverageMonths !== undefined && (
                <>
                  Covers ~{status.coverageMonths.toFixed(1)} month
                  {status.coverageMonths === 1 ? '' : 's'} of the{' '}
                  {formatMoney(status.monthlyNeed ?? 0, base)}/mo need.{' '}
                </>
              )}
              Target is {status.months} months of cover.
            </>
          )}
          {status.excludedCount > 0 && (
            <span className="mt-1 block text-ember-300">
              {status.excludedCount} emergency asset{status.excludedCount === 1 ? '' : 's'} excluded
              (no base value yet — refresh FX).
            </span>
          )}
        </p>
        <InlineTargetsForm
          ariaLabel="Emergency fund targets"
          fields={[
            {
              name: 'emergencyMonthlyNeed',
              label: `Monthly need · ${base}`,
              defaultValue: settings.emergencyMonthlyNeed,
              placeholder: 'e.g. 150000',
            },
            {
              name: 'emergencyMonths',
              label: 'Months of cover',
              defaultValue: settings.emergencyMonths,
              placeholder: 'e.g. 6',
            },
          ]}
        />
      </div>
    </section>
  )
}

function RiskMixCard({
  slices,
  base,
  hasTargets,
  settings,
}: {
  slices: RiskSlice[]
  base: Settings['baseCurrency']
  hasTargets: boolean
  settings: Settings
}) {
  return (
    <section aria-label="Risk mix" className="space-y-3">
      <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
        Risk allocation
      </h3>
      {slices.length === 0 ? (
        <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-10 text-center font-sans text-sm text-bone-300">
          Tag assets with a risk band (Safe / Moderate / High) on the Holdings page to see
          your risk mix here.
        </div>
      ) : (
        <ul className="space-y-3 border border-bone-100/10 bg-ink-900 p-5">
          {slices.map((s) => (
            <li key={s.band} className="space-y-1">
              <div className="flex items-baseline justify-between font-mono text-[11px] text-bone-300">
                <span className="uppercase tracking-[0.14em]">{s.label}</span>
                <span className="tabular-nums text-bone-400">
                  {formatMoney(s.valueBase, base)} · {(s.pct * 100).toFixed(1)}%
                  {s.targetPct !== undefined && (
                    <span className="text-tick-400"> / target {(s.targetPct * 100).toFixed(0)}%</span>
                  )}
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden bg-bone-100/10">
                <div className="h-full bg-tick-400/70" style={{ width: `${Math.max(1, s.pct * 100)}%` }} />
                {s.targetPct !== undefined && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 h-full w-px bg-bone-50"
                    style={{ left: `${Math.min(100, s.targetPct * 100)}%` }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5">
        {!hasTargets && slices.length > 0 && (
          <p className="font-sans text-xs text-bone-500">
            Set target weights below (% by risk band) to compare against a plan.
          </p>
        )}
        <InlineTargetsForm
          ariaLabel="Allocation targets"
          fields={[
            { name: 'alloc_safe', label: 'Safe %', defaultValue: targetPctFor(settings, 'safe'), placeholder: '0' },
            { name: 'alloc_moderate', label: 'Moderate %', defaultValue: targetPctFor(settings, 'moderate'), placeholder: '0' },
            { name: 'alloc_high', label: 'High %', defaultValue: targetPctFor(settings, 'high'), placeholder: '0' },
          ]}
        />
      </div>
    </section>
  )
}

function BulkInvestCard({
  settings,
  base,
}: {
  settings: Settings
  base: Settings['baseCurrency']
}) {
  const [lump, setLump] = useState('')
  const targets = settings.allocationTargets ?? []
  const lumpNum = Number(lump)
  const rows = useMemo(
    () => (Number.isFinite(lumpNum) ? bulkAllocation(lumpNum, targets) : []),
    [lumpNum, targets],
  )

  return (
    <section aria-label="Bulk invest" className="space-y-3">
      <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
        Bulk invest — what-if
      </h3>
      <div className="space-y-4 border border-bone-100/10 bg-ink-900 p-5">
        {targets.length === 0 ? (
          <p className="font-sans text-sm text-bone-300">
            Set allocation target weights in the <span className="text-bone-100">Risk allocation</span>{' '}
            card above to split a lump sum across risk bands.
          </p>
        ) : (
          <>
            <label className="grid gap-1.5 sm:max-w-[16rem]">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
                Lump sum to invest · {base}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={lump}
                onChange={(e) => setLump(e.target.value)}
                placeholder="e.g. 1000000"
                className="w-full border border-bone-100/15 bg-ink-950 px-3 py-2 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
              />
            </label>
            {rows.length > 0 && (
              <ul className="divide-y divide-bone-100/5 border border-bone-100/10">
                {rows.map((r) => (
                  <li
                    key={r.band}
                    className="flex items-center justify-between bg-ink-950 px-4 py-2.5 font-mono text-sm"
                  >
                    <span className="uppercase tracking-[0.14em] text-bone-300">
                      {r.label} · {r.targetPct}%
                    </span>
                    <span className="tabular-nums text-bone-50">{formatMoney(r.toInvest, base)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="font-sans text-xs text-bone-500">
              Scratch calculation — splits the lump sum by your target weights. Nothing is saved.
            </p>
          </>
        )}
      </div>
    </section>
  )
}

const railText: Record<string, string> = {
  jade: 'text-jade-300',
  tick: 'text-tick-300',
  ember: 'text-ember-300',
  mute: 'text-bone-300',
}
const railBar: Record<string, string> = {
  jade: 'bg-jade-400',
  tick: 'bg-tick-400',
  ember: 'bg-ember-400',
  mute: 'bg-bone-300/50',
}

/** Current stored pct for a risk band, or '' when unset — the inline form's default. */
function targetPctFor(settings: Settings, band: RiskBand): number | undefined {
  return (settings.allocationTargets ?? []).find((t) => t.riskBand === band)?.pct
}

type InlineField = {
  name: string
  label: string
  defaultValue: number | undefined
  placeholder?: string
}

/**
 * #6: edit planning targets inline instead of round-tripping to Settings. Posts
 * `intent=save` with ONLY its own fields to the shared `settingsAction`, which
 * read-modify-write MERGES (App.tsx `readSettingsFromForm`) — so an omitted field
 * (base currency, the other targets, and any future consent/keys) is preserved,
 * never clobbered by a partial save. The route loader revalidates on completion.
 */
function InlineTargetsForm({ ariaLabel, fields }: { ariaLabel: string; fields: InlineField[] }) {
  const fetcher = useFetcher()
  // Hide the "saved" badge once the user edits again, so a stale success signal
  // never sits beside changed-but-unsubmitted values (Tenet 1 — honest signals).
  const [dirty, setDirty] = useState(false)
  const saving = fetcher.state !== 'idle'
  const data = fetcher.data as { ok?: boolean } | undefined
  const saved = fetcher.state === 'idle' && data?.ok === true && !dirty
  return (
    <fetcher.Form
      method="post"
      action="/settings"
      aria-label={ariaLabel}
      onSubmit={() => setDirty(false)}
      className="flex flex-wrap items-end gap-3 border border-bone-100/10 bg-ink-900 p-4"
    >
      <input type="hidden" name="intent" value="save" />
      {fields.map((f) => (
        <label key={f.name} className="grid gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400">
            {f.label}
          </span>
          <input
            type="text"
            inputMode="decimal"
            name={f.name}
            defaultValue={f.defaultValue ?? ''}
            placeholder={f.placeholder}
            onChange={() => setDirty(true)}
            className="w-28 border border-bone-100/15 bg-ink-950 px-3 py-1.5 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
          />
        </label>
      ))}
      <button
        type="submit"
        disabled={saving}
        className="border border-tick-400 bg-tick-400/10 px-4 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-tick-400 transition hover:bg-tick-400 hover:text-ink-950 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      {saved && (
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-jade-300">saved</span>
      )}
    </fetcher.Form>
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
