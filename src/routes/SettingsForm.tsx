import { useEffect, useState } from 'react'
import { useFetcher, useLoaderData } from 'react-router-dom'
import type { BaseCurrency } from '../storage/holdings'
import type { NumberLocale, Settings } from '../storage/settings'
import { formatMoney } from '../lib/format'
import { FEATURE_GOALS, FEATURE_PLANNING } from '../featureFlags'

export type SettingsActionResult =
  | { ok: true; mode: 'saved' | 'refreshed' | 'manual'; rate?: number; fetchedAt?: number }
  | { ok: false; error: string }

export function SettingsForm() {
  const { settings } = useLoaderData() as { settings: Settings }
  const fetcher = useFetcher<SettingsActionResult>()
  const [name, setName] = useState(settings.name)
  const [baseCurrency, setBaseCurrency] = useState<BaseCurrency>(settings.baseCurrency)
  const [numberLocale, setNumberLocale] = useState<NumberLocale>(settings.numberLocale)
  const [manualRate, setManualRate] = useState('')

  useEffect(() => {
    setName(settings.name)
    setBaseCurrency(settings.baseCurrency)
    setNumberLocale(settings.numberLocale)
  }, [settings.name, settings.baseCurrency, settings.numberLocale])

  const pendingBaseChange = baseCurrency !== settings.baseCurrency
  const pendingProfileChange =
    name !== settings.name || numberLocale !== settings.numberLocale || pendingBaseChange
  const submitting = fetcher.state !== 'idle'
  const result = fetcher.data
  const buttonLabel = pendingBaseChange ? 'Save & refresh FX' : 'Refresh FX'

  return (
    <fetcher.Form method="post" className="space-y-8">
      <fieldset className="space-y-6 rounded-2xl border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
        <legend className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bone-400">
          Profile
        </legend>

        <label className="block space-y-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            Display name
          </span>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="field"
          />
        </label>

        <fieldset className="space-y-3">
          <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            Base currency
          </legend>
          <div className="flex gap-2">
            <RadioPill
              checked={baseCurrency === 'INR'}
              label="₹ INR"
              onChange={() => setBaseCurrency('INR')}
              name="baseCurrency"
              value="INR"
            />
            <RadioPill
              checked={baseCurrency === 'USD'}
              label="$ USD"
              onChange={() => setBaseCurrency('USD')}
              name="baseCurrency"
              value="USD"
            />
          </div>
          <p className="font-sans text-[11px] text-bone-400">
            All holdings show a base-currency equivalent. Foreign-currency holdings are
            recomputed when you refresh.
          </p>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            Number format
          </legend>
          <div className="flex gap-2">
            <RadioPill
              checked={numberLocale === 'en-IN'}
              label="1,00,000 (Indian)"
              onChange={() => setNumberLocale('en-IN')}
              name="numberLocale"
              value="en-IN"
            />
            <RadioPill
              checked={numberLocale === 'en-US'}
              label="100,000 (Western)"
              onChange={() => setNumberLocale('en-US')}
              name="numberLocale"
              value="en-US"
            />
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="space-y-5 rounded-2xl border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
        <legend className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bone-400">
          FX
        </legend>

        <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-bone-100/10 bg-bone-100/10 sm:grid-cols-2">
          <Meta
            label="Last rate"
            value={
              settings.lastFxRate === null
                ? '—'
                : `1 USD = ${formatMoney(settings.lastFxRate, 'INR')}`
            }
            hint="USD → INR (Frankfurter / ECB)"
          />
          <Meta
            label="Last refresh"
            value={
              settings.lastFxAsOf === null
                ? '—'
                : new Date(settings.lastFxAsOf).toLocaleString()
            }
            hint={settings.lastFxAsOf === null ? 'never refreshed' : 'local time'}
          />
        </dl>

        <button type="submit" name="intent" value="refresh" disabled={submitting} className="btn-primary">
          {submitting && fetcher.formData?.get('intent') === 'refresh'
            ? 'Refreshing…'
            : buttonLabel}
        </button>

        {pendingProfileChange && !pendingBaseChange && (
          <button
            type="submit"
            name="intent"
            value="save"
            disabled={submitting}
            className="btn-secondary ml-3"
          >
            Save profile
          </button>
        )}

        <details className="border-t border-bone-100/10 pt-5">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400 hover:text-bone-200">
            Paste rate manually
          </summary>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex-1 space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
                1 USD = … INR
              </span>
              <input
                type="number"
                step="any"
                min="1"
                max="999.99"
                name="manualRate"
                value={manualRate}
                onChange={(e) => setManualRate(e.target.value)}
                placeholder="e.g. 95.77"
                className="field font-mono tabular-nums"
              />
            </label>
            <button
              type="submit"
              name="intent"
              value="manual"
              disabled={submitting || manualRate === ''}
              className="btn-secondary"
            >
              Apply manual rate
            </button>
          </div>
          <p className="mt-2 font-sans text-[11px] text-bone-400">
            Use when Frankfurter is unreachable. Rate must be between 1 and 1000.
          </p>
        </details>

        {result && !result.ok && (
          <div className="rounded-xl border border-ember-400/40 bg-ember-900/30 p-4 font-sans text-sm text-ember-300">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
              fx failed ·{' '}
            </span>
            {result.error}
          </div>
        )}
        {result && result.ok && (
          <div className="rounded-xl border border-jade-400/40 bg-jade-900/20 p-4 font-sans text-sm text-jade-300">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em]">
              {result.mode === 'saved' ? 'saved' : 'refreshed'} ·{' '}
            </span>
            {result.mode === 'saved'
              ? 'Profile saved.'
              : `Rate ${result.rate} · ${
                  result.fetchedAt ? new Date(result.fetchedAt).toLocaleTimeString() : ''
                }`}
          </div>
        )}
      </fieldset>

      {(FEATURE_PLANNING || FEATURE_GOALS) && (
        <PlanningTargets settings={settings} submitting={submitting} />
      )}
    </fetcher.Form>
  )
}

/** Planning (Phase 3) + goal (Phase 4) targets. Uncontrolled inputs with
 *  `defaultValue` — they post inside the same settings form, and `intent=save`
 *  persists them via `readSettingsFromForm`. Blank clears a target. */
function PlanningTargets({
  settings,
  submitting,
}: {
  settings: Settings
  submitting: boolean
}) {
  const targetFor = (band: 'safe' | 'moderate' | 'high'): string => {
    const t = settings.allocationTargets?.find((x) => x.riskBand === band)
    return t ? String(t.pct) : ''
  }
  return (
    <fieldset className="space-y-6 rounded-2xl border border-bone-100/10 bg-ink-900 p-6 sm:p-8">
      <legend className="px-2 font-mono text-[10px] uppercase tracking-[0.2em] text-bone-400">
        Planning &amp; goals
      </legend>

      {FEATURE_GOALS && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TargetInput
            name="goalCorpus"
            label={`Goal corpus · ${settings.baseCurrency}`}
            defaultValue={settings.goalCorpus}
            placeholder="e.g. 5000000"
          />
          <TargetInput
            name="monthlyContribution"
            label={`Monthly contribution · ${settings.baseCurrency}`}
            defaultValue={settings.monthlyContribution}
            placeholder="e.g. 50000"
          />
        </div>
      )}

      {FEATURE_PLANNING && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <TargetInput
              name="emergencyMonthlyNeed"
              label={`Emergency monthly need · ${settings.baseCurrency}`}
              defaultValue={settings.emergencyMonthlyNeed}
              placeholder="e.g. 150000"
            />
            <TargetInput
              name="emergencyMonths"
              label="Emergency months of cover"
              defaultValue={settings.emergencyMonths}
              placeholder="e.g. 6"
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
              Allocation targets (% by risk band)
            </legend>
            <div className="grid grid-cols-3 gap-4">
              <TargetInput name="alloc_safe" label="Safe %" defaultValue={targetFor('safe') === '' ? undefined : Number(targetFor('safe'))} placeholder="0" />
              <TargetInput name="alloc_moderate" label="Moderate %" defaultValue={targetFor('moderate') === '' ? undefined : Number(targetFor('moderate'))} placeholder="0" />
              <TargetInput name="alloc_high" label="High %" defaultValue={targetFor('high') === '' ? undefined : Number(targetFor('high'))} placeholder="0" />
            </div>
          </fieldset>
        </>
      )}

      <button type="submit" name="intent" value="save" disabled={submitting} className="btn-primary">
        Save targets
      </button>
      <p className="font-sans text-[11px] text-bone-400">
        Used by the Planning tab and the goal projection on Analytics. Leave a field
        blank to clear it.
      </p>
    </fieldset>
  )
}

function TargetInput({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string
  label: string
  defaultValue: number | undefined
  placeholder: string
}) {
  return (
    <label className="block space-y-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        name={name}
        defaultValue={defaultValue !== undefined ? String(defaultValue) : ''}
        placeholder={placeholder}
        className="field font-mono tabular-nums"
      />
    </label>
  )
}

function RadioPill({
  checked,
  label,
  onChange,
  name,
  value,
}: {
  checked: boolean
  label: string
  onChange: () => void
  name: string
  value: string
}) {
  return (
    // The radio input is `sr-only`, so the global focus ring would render on a
    // 0×0 element (invisible). `has-[:focus-visible]` lifts the ring onto the
    // label instead, restoring a keyboard focus indicator. Selected state uses
    // the solid amber fill — the same active treatment as every other
    // segmented control in the app — rather than a faint 10% wash.
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 font-sans text-[12px] tracking-tight transition has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-act-400 has-[:focus-visible]:outline-offset-2 ${
        checked
          ? 'border-act-400 bg-act-400 text-ink-950'
          : 'border-bone-100/15 bg-ink-850 text-bone-300 hover:border-bone-100/40 hover:text-bone-50'
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {label}
    </label>
  )
}

function Meta({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-ink-900 px-4 py-4">
      <dt className="flex items-center gap-2 font-sans text-[10px]  text-bone-400">
        <span className="h-px w-3 bg-act-400/60" />
        {label}
      </dt>
      <dd className="mt-2 font-mono text-sm tabular-nums text-bone-50">{value}</dd>
      <p className="mt-1 font-mono text-[10px] text-bone-400">{hint}</p>
    </div>
  )
}
