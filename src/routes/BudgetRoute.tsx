import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useFetcher, useLoaderData } from 'react-router-dom'
import type { BudgetLine, BudgetMonth } from '../storage/budget'
import type { BudgetTag, BudgetTagKind } from '../storage/budgetTags'
import { tagDedupeKey } from '../storage/budgetTags'
import type { HistoryRecord } from '../storage/history'
import type { Settings } from '../storage/settings'
import {
  monthlyAverages,
  monthOverMonth,
  summarizeAll,
  summarizeMonth,
  type BudgetSummary,
} from '../lib/budget'
import { investedDeltaForMonth } from '../lib/analytics'
import { formatMoney } from '../lib/format'
import { formatMonthKey } from '../components/charts/chartTheme'
import { MonthStrip } from '../components/charts/MonthStrip'
import { FEATURE_BUDGET_TAGS } from '../featureFlags'

// The two donuts pull in Recharts (~100KB+); keep them out of the initial bundle
// by lazy-loading them exactly as Overview/Equity do (productContext/dsl.md §
// dsl-decision-guide). The month strip above stays eager — it is plain markup.
const BudgetCharts = lazy(() => import('../components/charts/BudgetCharts'))
// Per-tag line charts across months — also Recharts, same lazy bulkhead.
const TagTrends = lazy(() => import('../components/charts/TagTrends'))

/** A per-tag trend needs at least this many logged months to read as a line
 *  rather than a lone dot. Below it the section is hidden entirely. */
const MIN_MONTHS_FOR_TAG_TRENDS = 2

/** Action response from `budgetAction`. */
export type BudgetActionResult =
  | { ok: true; mode: 'saved' | 'deleted' }
  | { ok: true; mode: 'tag-created'; tag: BudgetTag }
  | { ok: true; mode: 'tag-deleted' }
  | { ok: false; error: string }

type LoaderData = {
  months: BudgetMonth[]
  settings: Settings
  tags: BudgetTag[]
  history: HistoryRecord[]
}

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
  const { months, settings, tags, history } = useLoaderData() as LoaderData
  const base = settings.baseCurrency

  // `focused` is the month key in view; `null` means the add-a-month form. On a
  // fresh (empty) budget we land straight in add mode. `editing` swaps the
  // focused-month panel between its read view and the inline line editor.
  const [focused, setFocused] = useState<string | null>(months[0]?.month ?? null)
  const [editing, setEditing] = useState<boolean>(months.length === 0)

  const all = useMemo(() => summarizeAll(months), [months])
  const averages = useMemo(() => monthlyAverages(months), [months])

  // Resolve the focused month and its chronological predecessor. `months` is
  // newest-first (loader sort), so the previous month is the *next* index.
  const focusedIndex = focused === null ? -1 : months.findIndex((m) => m.month === focused)
  const focusedMonth = focusedIndex >= 0 ? months[focusedIndex] : undefined
  const prevSummary =
    focusedIndex >= 0 && focusedIndex + 1 < months.length
      ? summarizeMonth(months[focusedIndex + 1])
      : undefined

  // If the focused month vanished (deleted, and revalidation dropped it), fall
  // back to the newest remaining month in read mode rather than the add form.
  useEffect(() => {
    if (!editing && focused !== null && focusedIndex < 0) {
      setFocused(months[0]?.month ?? null)
    }
  }, [editing, focused, focusedIndex, months])

  const focusMonth = (m: string) => {
    setFocused(m)
    setEditing(false)
  }
  const startAdd = () => {
    setFocused(null)
    setEditing(true)
  }
  const onSaved = (savedMonth: string) => {
    setFocused(savedMonth)
    setEditing(false)
  }
  const cancelEdit = () => {
    setEditing(false)
    if (focused === null) setFocused(months[0]?.month ?? null)
  }

  const showEditor = editing || !focusedMonth

  return (
    <div className="space-y-8">
      <PageHead
        title="Budget"
        caption="Monthly cash flow — income, expenses, and what you invested"
      />

      {months.length > 0 && <AggregateSummary all={all} averages={averages} base={base} />}

      {months.length > 0 && (
        <MonthStrip
          months={months}
          base={base}
          focused={showEditor && focused === null ? null : focused}
          onFocus={focusMonth}
          onAdd={startAdd}
        />
      )}

      {showEditor ? (
        <BudgetEditor
          key={focused ?? 'new'}
          base={base}
          tags={tags}
          history={history}
          existing={focusedMonth}
          onSaved={onSaved}
          onCancel={months.length > 0 ? cancelEdit : undefined}
        />
      ) : (
        <FocusedMonthView
          month={focusedMonth}
          prevSummary={prevSummary}
          base={base}
          onEdit={() => setEditing(true)}
        />
      )}

      {FEATURE_BUDGET_TAGS && months.length >= MIN_MONTHS_FOR_TAG_TRENDS && (
        <Suspense fallback={<ChartsFallback />}>
          <TagTrends months={months} baseCurrency={base} />
        </Suspense>
      )}
    </div>
  )
}

/** Demoted "across all months" summary — one quiet line, not the old 4-tile grid.
 *  The per-month bars in the strip carry the trend; this answers "what's my
 *  typical month" over the whole history. */
function AggregateSummary({
  all,
  averages,
  base,
}: {
  all: BudgetSummary
  averages: ReturnType<typeof monthlyAverages>
  base: Settings['baseCurrency']
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-l-2 border-bone-100/10 pl-4 font-mono text-[11px] text-bone-400">
      <span>
        lifetime income{' '}
        <span className="tabular-nums whitespace-nowrap text-bone-100">{formatMoney(all.totalIncome, base)}</span>
      </span>
      <span>
        invested{' '}
        <span className="tabular-nums whitespace-nowrap text-jade-300">{formatMoney(all.invested, base)}</span>
      </span>
      {averages && (
        <span>
          avg savings rate{' '}
          <span className="tabular-nums whitespace-nowrap text-bone-100">
            {averages.savingsRate === undefined ? '—' : `${Math.round(averages.savingsRate * 100)}%`}
          </span>{' '}
          <span className="text-bone-500">· avg of {averages.months} mo</span>
        </span>
      )}
    </div>
  )
}

function FocusedMonthView({
  month,
  prevSummary,
  base,
  onEdit,
}: {
  month: BudgetMonth
  prevSummary: BudgetSummary | undefined
  base: Settings['baseCurrency']
  onEdit: () => void
}) {
  const fetcher = useFetcher()
  const s = summarizeMonth(month)
  const delta = monthOverMonth(s, prevSummary)

  return (
    <section aria-label={`${formatMonthKey(month.month)} detail`} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h3 className="font-display text-xl tabular-nums text-bone-50">
            {formatMonthKey(month.month)}
          </h3>
          {!delta && (
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-500">
              first month · no prior to compare
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-act-400 hover:text-act-400"
          >
            Edit
          </button>
          <fetcher.Form method="post" action="/budget">
            <input type="hidden" name="intent" value="deleteMonth" />
            <input type="hidden" name="month" value={month.month} />
            <button
              type="submit"
              onClick={(e) => {
                if (!window.confirm(`Delete budget for ${formatMonthKey(month.month)}?`))
                  e.preventDefault()
              }}
              className="border border-bone-100/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-bone-300 transition hover:border-ember-400 hover:text-ember-400"
            >
              Delete
            </button>
          </fetcher.Form>
        </div>
      </div>

      <section
        aria-label="This month"
        className="grid grid-cols-2 gap-px overflow-hidden border border-bone-100/10 bg-bone-100/10 sm:grid-cols-4"
      >
        <Stat
          label={`Income · ${base}`}
          value={formatMoney(s.totalIncome, base)}
          sub={deltaText(delta?.income, base)}
          tone="tick"
        />
        <Stat
          label="Spent"
          value={pct(s.spentPct)}
          sub={deltaText(delta?.expenses, base)}
          tone="ember"
        />
        <Stat
          label="Invested"
          value={pct(s.investedPct)}
          sub={deltaText(delta?.invested, base)}
          tone="jade"
        />
        <Stat
          label="Remaining"
          value={pct(s.remainingPct)}
          sub={deltaText(delta?.remaining, base)}
          tone={s.remaining >= 0 ? 'mute' : 'ember'}
        />
      </section>

      <Suspense fallback={<ChartsFallback />}>
        <BudgetCharts month={month} summary={s} baseCurrency={base} />
      </Suspense>

      <div className="grid gap-5 sm:grid-cols-2">
        <LineDetails title="Income" lines={month.income} base={base} />
        <LineDetails title="Expenses" lines={month.expenses} base={base} />
      </div>
    </section>
  )
}

/** Signed month-over-month movement for a stat's sub-line. `undefined` delta
 *  (no prior month) renders nothing; the panel header carries the "first month"
 *  note instead. `±0` is honest for a genuine no-change. */
function deltaText(n: number | undefined, base: Settings['baseCurrency']): string | undefined {
  if (n === undefined) return undefined
  if (n === 0) return '±0 vs last mo'
  const arrow = n > 0 ? '▲' : '▼'
  return `${arrow} ${formatMoney(Math.abs(n), base)} vs last mo`
}

function LineDetails({
  title,
  lines,
  base,
}: {
  title: string
  lines: BudgetLine[]
  base: Settings['baseCurrency']
}) {
  const total = lines.reduce((s, l) => s + l.amount, 0)
  return (
    <div className="border border-bone-100/10 bg-ink-900 p-4">
      <div className="flex items-baseline justify-between">
        <h4 className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">{title}</h4>
         <span className="font-mono text-[11px] tabular-nums whitespace-nowrap text-bone-300">
          {formatMoney(total, base)}
        </span>
      </div>
      {lines.length === 0 ? (
        <p className="mt-3 font-sans text-xs text-bone-500">No {title.toLowerCase()} lines.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {lines.map((l, i) => (
            <li
              key={`${l.category}-${i}`}
              className="flex items-center justify-between gap-3 font-sans text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-bone-200">{l.category}</span>
              <span className="shrink-0 font-mono text-[13px] tabular-nums whitespace-nowrap text-bone-300">
                {formatMoney(l.amount, base)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function BudgetEditor({
  base,
  tags,
  history,
  existing,
  onSaved,
  onCancel,
}: {
  base: Settings['baseCurrency']
  tags: BudgetTag[]
  history: HistoryRecord[]
  existing: BudgetMonth | undefined
  onSaved: (month: string) => void
  onCancel: (() => void) | undefined
}) {
  const fetcher = useFetcher<BudgetActionResult>()
  // A separate fetcher for tag create/delete — these are independent of the
  // month save (no nested <form>), and the route loader revalidates after each
  // so the new/removed tag flows back into the picker.
  const tagFetcher = useFetcher()
  const incomeTags = useMemo(() => tags.filter((t) => t.kind === 'income'), [tags])
  const expenseTags = useMemo(() => tags.filter((t) => t.kind === 'expense'), [tags])

  const onCreateTag = (label: string, kind: BudgetTagKind) => {
    tagFetcher.submit({ intent: 'createTag', label, kind }, { method: 'post', action: '/budget' })
  }
  const onDeleteTag = (id: string) => {
    tagFetcher.submit({ intent: 'deleteTag', id }, { method: 'post', action: '/budget' })
  }

  const [month, setMonth] = useState(existing?.month ?? currentMonthKey())
  const [income, setIncome] = useState<Line[]>(
    existing ? toLines(existing.income) : [{ id: lineSeq++, category: '', amount: '' }],
  )
  const [expenses, setExpenses] = useState<Line[]>(
    existing ? toLines(existing.expenses) : [{ id: lineSeq++, category: '', amount: '' }],
  )
  const [invested, setInvested] = useState(existing ? String(existing.invested) : '')

  // #4: an honest read-only hint — how much the holdings cost basis moved across
  // history snapshots bracketing this month. Not an auto-fill; `undefined` (no
  // hint) when snapshots don't cleanly bracket the month.
  const investedHint = useMemo(
    () => investedDeltaForMonth(history, base, month),
    [history, base, month],
  )

  const incomeJson = JSON.stringify(linesToPayload(income))
  const expensesJson = JSON.stringify(linesToPayload(expenses))
  const saving = fetcher.state !== 'idle'
  const saved = fetcher.state === 'idle' && fetcher.data?.ok === true && fetcher.data.mode === 'saved'

  // Edit-in-place is a *view* concern only: the save writes through the unchanged
  // `budgetAction`/`storage/budget` path (no new write path, no data-model risk).
  // Once the save lands, hand the saved month back so the parent drops to the
  // read view focused on it.
  useEffect(() => {
    if (saved) onSaved(month)
    // `month` is stable across the in-flight save; `onSaved` is a fresh closure
    // each render but only fires on the save→idle edge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved])

  return (
    <section
      aria-label={existing ? `Edit ${existing.month}` : 'Add month'}
      className="space-y-5 border border-bone-100/10 bg-ink-900 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-sm font-medium text-bone-300">
          {existing ? `Edit ${formatMonthKey(existing.month)}` : 'Add month'}
        </h3>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400 transition hover:text-bone-100"
          >
            Cancel
          </button>
        )}
      </div>

      <fetcher.Form method="post" action="/budget" className="grid min-w-0 gap-5">
        <input type="hidden" name="intent" value="saveMonth" />
        <input type="hidden" name="incomeJson" value={incomeJson} />
        <input type="hidden" name="expensesJson" value={expensesJson} />

        <label className="grid max-w-full gap-1.5 sm:max-w-[12rem]">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
            Month
          </span>
          <input
            type="month"
            name="month"
            required
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full border border-bone-100/15 bg-ink-950 px-3 py-2 font-sans text-sm text-bone-100 focus:border-act-400 focus:outline-none"
          />
        </label>

        <LineEditor
          title="Income"
          kind="income"
          lines={income}
          onChange={setIncome}
          base={base}
          tags={incomeTags}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
        />
        <LineEditor
          title="Expenses"
          kind="expense"
          lines={expenses}
          onChange={setExpenses}
          base={base}
          tags={expenseTags}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
        />

        <label className="grid max-w-full gap-1.5 sm:max-w-[16rem]">
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
            className="w-full border border-bone-100/15 bg-ink-950 px-3 py-2 font-sans text-sm text-bone-100 focus:border-act-400 focus:outline-none"
          />
          {investedHint && (
            <span className="font-sans text-[11px] text-bone-500">
              Your holdings cost basis moved{' '}
              <span className="tabular-nums whitespace-nowrap text-bone-300">
                {investedHint.delta >= 0 ? '+' : '−'}
                {formatMoney(Math.abs(investedHint.delta), base)}
              </span>{' '}
              between snapshots ({investedHint.fromDate} → {investedHint.toDate}) — a rough guide, not an entry.
            </span>
          )}
        </label>

        {fetcher.data && !fetcher.data.ok && (
          <div role="alert" className="border border-ember-400/40 bg-ember-900/30 p-3 font-sans text-xs text-ember-300">
            {fetcher.data.error}
          </div>
        )}

        <div>
          <button
            type="submit"
            disabled={saving}
            className="border border-act-400 bg-act-400 px-6 py-2.5 font-sans text-[11px] font-medium  text-ink-950 transition hover:bg-act-300 disabled:opacity-50"
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
  kind,
  lines,
  onChange,
  base,
  tags,
  onCreateTag,
  onDeleteTag,
}: {
  title: string
  kind: BudgetTagKind
  lines: Line[]
  onChange: (next: Line[]) => void
  base: Settings['baseCurrency']
  tags: BudgetTag[]
  onCreateTag: (label: string, kind: BudgetTagKind) => void
  onDeleteTag: (id: string) => void
}) {
  const update = (id: number, patch: Partial<Line>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const remove = (id: number) => onChange(lines.filter((l) => l.id !== id))
  const add = () => onChange([...lines, { id: lineSeq++, category: '', amount: '' }])

  // Tags are a reusable, kind-scoped vocabulary. The category input is backed by
  // a native <datalist> of this kind's tag labels (reuse via autocomplete);
  // picking a tag just writes its label into `category` (managed label, not a
  // foreign key). A label that isn't yet a tag can be saved as one inline.
  const tagsOn = FEATURE_BUDGET_TAGS
  const listId = `budget-tags-${kind}`
  const knownKeys = new Set(tags.map((t) => tagDedupeKey(t.label, t.kind)))
  const isUntagged = (value: string) => {
    const v = value.trim()
    return v !== '' && !knownKeys.has(tagDedupeKey(v, kind))
  }

  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
        {title} · {base}
      </legend>

      {tagsOn && (
        <datalist id={listId}>
          {tags.map((t) => (
            <option key={t.id} value={t.label} />
          ))}
        </datalist>
      )}

      {lines.map((l) => (
        <div key={l.id} className="flex min-w-0 items-center gap-2">
           <input
             type="text"
             aria-label={`${title} category`}
             value={l.category}
             onChange={(e) => update(l.id, { category: e.target.value })}
             placeholder={tagsOn ? 'Pick or type a tag' : 'Category'}
             list={tagsOn ? listId : undefined}
             className="min-w-0 flex-1 border border-bone-100/15 bg-ink-950 px-3 py-1.5 font-sans text-sm text-bone-100 focus:border-act-400 focus:outline-none"
          />
          {tagsOn && isUntagged(l.category) && (
            <button
              type="button"
              onClick={() => onCreateTag(l.category.trim(), kind)}
              title={`Save "${l.category.trim()}" as a reusable ${kind} tag`}
              className="whitespace-nowrap border border-act-400/40 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-act-400 transition hover:border-act-400 hover:text-act-300"
            >
              + tag
            </button>
          )}
          <input
            type="text"
            inputMode="decimal"
            aria-label={`${title} amount`}
            value={l.amount}
            onChange={(e) => update(l.id, { amount: e.target.value })}
            placeholder="Amount"
            className="w-24 border border-bone-100/15 bg-ink-950 px-3 py-1.5 text-right font-mono text-sm tabular-nums text-bone-100 focus:border-act-400 focus:outline-none sm:w-32"
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
        className="w-fit font-mono text-[10px] uppercase tracking-[0.16em] text-act-400 transition hover:text-act-300"
      >
        + Add line
      </button>

      {tagsOn && tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-bone-500">
            {kind} tags
          </span>
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 border border-bone-100/15 bg-ink-950 py-0.5 pl-2 pr-1 font-sans text-[11px] text-bone-300"
            >
              {t.label}
              <button
                type="button"
                aria-label={`Delete tag ${t.label}`}
                onClick={() => onDeleteTag(t.id)}
                title="Remove from picker (past months keep this label)"
                className="px-1 font-mono text-bone-500 transition hover:text-ember-400"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
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

/** Suspense fallback while the lazy `BudgetCharts` (Recharts) chunk loads —
 *  mirrors the Overview/Equity chart fallbacks so the wait reads consistently. */
function ChartsFallback() {
  return (
    <div className="flex min-h-[320px] items-center justify-center border border-bone-100/10 bg-ink-900">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="h-4 w-4 spin-slow border border-bone-100/15 border-t-act-400"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-bone-400">
          Loading charts
        </span>
      </div>
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

type Tone = 'tick' | 'jade' | 'ember' | 'mute'
const toneRail: Record<Tone, string> = {
  tick: 'bg-bone-200/60',
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
      <div className="flex items-center gap-2 font-sans text-[10px]  text-bone-400">
        <span className={`h-px w-3 ${toneRail[tone]}`} />
        {label}
      </div>
      <div className={`mt-3 font-display text-2xl leading-none tabular-nums whitespace-nowrap ${toneText[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-2 font-mono text-[11px] tabular-nums whitespace-nowrap text-bone-400">{sub}</div>}
    </div>
  )
}
