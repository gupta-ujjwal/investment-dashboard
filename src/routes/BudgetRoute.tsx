import { useMemo, useState } from 'react'
import { useFetcher, useLoaderData } from 'react-router-dom'
import type { BudgetLine, BudgetMonth } from '../storage/budget'
import type { Settings } from '../storage/settings'
import { summarizeAll, summarizeMonth, type BudgetSummary } from '../lib/budget'
import { formatMoney } from '../lib/format'

/** Action response from `budgetAction`. */
export type BudgetActionResult =
  | { ok: true; mode: 'saved' | 'deleted' }
  | { ok: false; error: string }

type LoaderData = { months: BudgetMonth[]; settings: Settings }

type Line = { id: number; category: string; amount: string }

let lineSeq = 0
function toLines(items: BudgetLine[]): Line[] {
  return items.map((l) => ({ id: lineSeq++, category: l.category, amount: String(l.amount) }))
}

function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function BudgetRoute() {
  const { months, settings } = useLoaderData() as LoaderData
  const base = settings.baseCurrency

  const [editingMonth, setEditingMonth] = useState<string | null>(null)
  const all = useMemo(() => summarizeAll(months), [months])

  return (
    <div className="space-y-8">
      <PageHead
        title="Budget"
        caption="Monthly cash flow — income, expenses, and what you invested"
      />

      {months.length > 0 && (
        <section
          aria-label="Across all months"
          className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4"
        >
          <Stat label={`Income · ${base}`} value={formatMoney(all.totalIncome, base)} tone="tick" />
          <Stat
            label="Spent"
            value={pct(all.spentPct)}
            sub={formatMoney(all.totalExpenses, base)}
            tone="ember"
          />
          <Stat
            label="Invested"
            value={pct(all.investedPct)}
            sub={formatMoney(all.invested, base)}
            tone="jade"
          />
          <Stat
            label="Remaining"
            value={pct(all.remainingPct)}
            sub={formatMoney(all.remaining, base)}
            tone={all.remaining >= 0 ? 'mute' : 'ember'}
          />
        </section>
      )}

      <BudgetEditor
        key={editingMonth ?? 'new'}
        base={base}
        existing={editingMonth ? months.find((m) => m.month === editingMonth) : undefined}
        onDone={() => setEditingMonth(null)}
      />

      <section aria-label="Saved months" className="space-y-3">
        <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
          Months
        </h3>
        {months.length === 0 ? (
          <div className="border border-dashed border-bone-100/15 bg-ink-900 px-8 py-12 text-center font-sans text-sm text-bone-300">
            No months yet. Add one above to start tracking cash flow.
          </div>
        ) : (
          <ul className="space-y-2">
            {months.map((m) => (
              <MonthCard
                key={m.month}
                month={m}
                base={base}
                onEdit={() => setEditingMonth(m.month)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function MonthCard({
  month,
  base,
  onEdit,
}: {
  month: BudgetMonth
  base: Settings['baseCurrency']
  onEdit: () => void
}) {
  const fetcher = useFetcher()
  const s: BudgetSummary = summarizeMonth(month)
  return (
    <li className="border border-bone-100/10 bg-ink-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-display text-lg tabular-nums text-bone-50">{month.month}</div>
        <div className="flex items-center gap-4 font-mono text-[11px] text-bone-300">
          <span>
            inc <span className="tabular-nums text-bone-100">{formatMoney(s.totalIncome, base)}</span>
          </span>
          <span className="text-ember-300">spent {pct(s.spentPct)}</span>
          <span className="text-jade-300">inv {pct(s.investedPct)}</span>
          <span className={s.remaining >= 0 ? 'text-bone-300' : 'text-ember-300'}>
            rem {pct(s.remainingPct)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-tick-400 hover:text-tick-400"
          >
            Edit
          </button>
          <fetcher.Form method="post" action="/budget">
            <input type="hidden" name="intent" value="deleteMonth" />
            <input type="hidden" name="month" value={month.month} />
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm(`Delete budget for ${month.month}?`)) e.preventDefault()
              }}
              className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-ember-400 hover:text-ember-400"
            >
              Delete
            </button>
          </fetcher.Form>
        </div>
      </div>
    </li>
  )
}

function BudgetEditor({
  base,
  existing,
  onDone,
}: {
  base: Settings['baseCurrency']
  existing: BudgetMonth | undefined
  onDone: () => void
}) {
  const fetcher = useFetcher<BudgetActionResult>()
  const [month, setMonth] = useState(existing?.month ?? currentMonthKey())
  const [income, setIncome] = useState<Line[]>(
    existing ? toLines(existing.income) : [{ id: lineSeq++, category: '', amount: '' }],
  )
  const [expenses, setExpenses] = useState<Line[]>(
    existing ? toLines(existing.expenses) : [{ id: lineSeq++, category: '', amount: '' }],
  )
  const [invested, setInvested] = useState(existing ? String(existing.invested) : '')

  const incomeJson = JSON.stringify(linesToPayload(income))
  const expensesJson = JSON.stringify(linesToPayload(expenses))
  const saving = fetcher.state !== 'idle'
  const saved = fetcher.state === 'idle' && fetcher.data?.ok === true

  return (
    <section
      aria-label={existing ? `Edit ${existing.month}` : 'Add month'}
      className="space-y-5 border border-bone-100/10 bg-ink-900 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-sm font-medium uppercase tracking-[0.16em] text-bone-300">
          {existing ? `Edit ${existing.month}` : 'Add month'}
        </h3>
        {existing && (
          <button
            type="button"
            onClick={onDone}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400 transition hover:text-bone-100"
          >
            New month
          </button>
        )}
      </div>

      <fetcher.Form
        method="post"
        action="/budget"
        className="grid gap-5"
        onSubmit={() => {
          // After a successful save of an edit, drop back to the new-month form.
          if (existing) setTimeout(onDone, 0)
        }}
      >
        <input type="hidden" name="intent" value="saveMonth" />
        <input type="hidden" name="incomeJson" value={incomeJson} />
        <input type="hidden" name="expensesJson" value={expensesJson} />

        <label className="grid gap-1.5 sm:max-w-[12rem]">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            Month
          </span>
          <input
            type="month"
            name="month"
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full border border-bone-100/15 bg-ink-950 px-3 py-2 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
          />
        </label>

        <LineEditor title="Income" lines={income} onChange={setIncome} base={base} />
        <LineEditor title="Expenses" lines={expenses} onChange={setExpenses} base={base} />

        <label className="grid gap-1.5 sm:max-w-[16rem]">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            Invested this month · {base}
          </span>
          <input
            type="text"
            inputMode="decimal"
            name="invested"
            value={invested}
            onChange={(e) => setInvested(e.target.value)}
            placeholder="e.g. 50000"
            className="w-full border border-bone-100/15 bg-ink-950 px-3 py-2 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
          />
        </label>

        {fetcher.data && !fetcher.data.ok && (
          <div role="alert" className="border border-ember-400/40 bg-ember-900/30 p-3 font-sans text-xs text-ember-300">
            {fetcher.data.error}
          </div>
        )}
        {saved && (
          <div role="status" className="font-mono text-[11px] uppercase tracking-[0.16em] text-jade-300">
            saved
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={saving}
            className="border border-tick-400 bg-tick-400 px-6 py-2.5 font-sans text-[11px] font-medium uppercase tracking-[0.16em] text-ink-950 transition hover:bg-tick-200 disabled:opacity-50"
          >
            {saving ? 'Saving…' : existing ? 'Save changes' : 'Save month'}
          </button>
        </div>
      </fetcher.Form>
    </section>
  )
}

function LineEditor({
  title,
  lines,
  onChange,
  base,
}: {
  title: string
  lines: Line[]
  onChange: (next: Line[]) => void
  base: Settings['baseCurrency']
}) {
  const update = (id: number, patch: Partial<Line>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const remove = (id: number) => onChange(lines.filter((l) => l.id !== id))
  const add = () => onChange([...lines, { id: lineSeq++, category: '', amount: '' }])

  return (
    <fieldset className="grid gap-2">
      <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
        {title} · {base}
      </legend>
      {lines.map((l) => (
        <div key={l.id} className="flex items-center gap-2">
          <input
            type="text"
            aria-label={`${title} category`}
            value={l.category}
            onChange={(e) => update(l.id, { category: e.target.value })}
            placeholder="Category"
            className="flex-1 border border-bone-100/15 bg-ink-950 px-3 py-1.5 font-sans text-sm text-bone-100 focus:border-tick-400 focus:outline-none"
          />
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${title} amount`}
            value={l.amount}
            onChange={(e) => update(l.id, { amount: e.target.value })}
            placeholder="Amount"
            className="w-32 border border-bone-100/15 bg-ink-950 px-3 py-1.5 text-right font-mono text-sm tabular-nums text-bone-100 focus:border-tick-400 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Remove line"
            onClick={() => remove(l.id)}
            className="border border-bone-100/15 px-2 py-1.5 font-mono text-xs text-bone-400 transition hover:border-ember-400 hover:text-ember-400"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="w-fit font-mono text-[10px] uppercase tracking-[0.16em] text-tick-400 transition hover:text-tick-200"
      >
        + Add line
      </button>
    </fieldset>
  )
}

function linesToPayload(lines: Line[]): BudgetLine[] {
  return lines
    .map((l) => ({ category: l.category.trim(), amount: Number(l.amount) }))
    .filter((l) => l.category !== '' && Number.isFinite(l.amount))
}

function pct(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(0)}%`
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

type Tone = 'tick' | 'jade' | 'ember' | 'mute'
const toneRail: Record<Tone, string> = {
  tick: 'bg-tick-400/60',
  jade: 'bg-jade-400/70',
  ember: 'bg-ember-400/70',
  mute: 'bg-bone-300/40',
}
const toneText: Record<Tone, string> = {
  tick: 'text-bone-50',
  jade: 'text-jade-300',
  ember: 'text-ember-300',
  mute: 'text-bone-50',
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: Tone
}) {
  return (
    <div className="bg-ink-900 px-5 py-5">
      <div className="flex items-center gap-2 font-sans text-[10px] uppercase tracking-[0.18em] text-bone-400">
        <span className={`h-px w-3 ${toneRail[tone]}`} />
        {label}
      </div>
      <div className={`mt-3 font-display text-2xl leading-none tabular-nums ${toneText[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-2 font-mono text-[11px] tabular-nums text-bone-400">{sub}</div>}
    </div>
  )
}
