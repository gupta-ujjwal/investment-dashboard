import { Link } from 'react-router-dom'
import type { ActionItem, ActionSeverity } from '../lib/actionRail'

const SEVERITY_LABEL: Record<ActionSeverity, string> = {
  crit: 'attention',
  warn: 'heads up',
  info: 'fyi',
}

const SEVERITY_CLASS: Record<ActionSeverity, string> = {
  crit: 'border-sev-crit/30 bg-sev-crit/10',
  warn: 'border-sev-warn/30 bg-sev-warn/10',
  info: 'border-sev-info/30 bg-sev-info/10',
}

const SEVERITY_TEXT: Record<ActionSeverity, string> = {
  crit: 'text-sev-crit',
  warn: 'text-sev-warn',
  info: 'text-sev-info',
}

/** Splits `headline` on the first occurrence of `emphasis` and renders that
 *  substring in the severity color, the rest in the neutral body tone —
 *  `emphasis` is always a literal substring of `headline` (see `ActionItem`'s
 *  doc comment in `actionRail.ts`), never a pattern to match loosely. */
function Headline({ item }: { item: ActionItem }) {
  const start = item.headline.indexOf(item.emphasis)
  if (start === -1) {
    return <p className="font-sans text-sm text-bone-100">{item.headline}</p>
  }
  const before = item.headline.slice(0, start)
  const after = item.headline.slice(start + item.emphasis.length)
  return (
    <p className="font-sans text-sm text-bone-100">
      {before}
      <span className={`font-semibold ${SEVERITY_TEXT[item.severity]}`}>{item.emphasis}</span>
      {after}
    </p>
  )
}

export function ActionCard({ item }: { item: ActionItem }) {
  return (
    <li
      className={`flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${SEVERITY_CLASS[item.severity]}`}
    >
      <div className="min-w-0">
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] ${SEVERITY_TEXT[item.severity]}`}
        >
          {SEVERITY_LABEL[item.severity]} ·{' '}
        </span>
        <Headline item={item} />
        <p className="mt-1 font-mono text-[11px] text-bone-400">{item.detail}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          to={item.primary.to}
          className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition hover:opacity-80 ${SEVERITY_CLASS[item.severity]} ${SEVERITY_TEXT[item.severity]}`}
        >
          {item.primary.label} →
        </Link>
        {item.secondary && (
          <Link
            to={item.secondary.to}
            className="inline-flex w-fit items-center gap-2 rounded-full border border-bone-100/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-bone-400 transition hover:border-bone-100/30 hover:text-bone-200"
          >
            {item.secondary.label}
          </Link>
        )}
      </div>
    </li>
  )
}
