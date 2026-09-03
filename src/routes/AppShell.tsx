import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { HoverTile } from '../components/decor/HoverTile'
import { FEATURE_BUDGET, FEATURE_PLANNING } from '../featureFlags'

type Tab = {
  to: string
  label: string
  icon: (props: { className?: string }) => React.ReactNode
  enabled: boolean
}

const primaryTabs: Tab[] = [
  { to: '/overview', label: 'Today', icon: TodayIcon, enabled: true },
  { to: '/portfolio', label: 'Portfolio', icon: PortfolioIcon, enabled: true },
  { to: '/budget', label: 'Cash flow', icon: CashflowIcon, enabled: FEATURE_BUDGET },
  { to: '/planning', label: 'Plan', icon: PlanIcon, enabled: FEATURE_PLANNING },
].filter((t) => t.enabled)

const utilityTabs: Tab[] = [
  { to: '/import', label: 'Import', icon: ImportIcon, enabled: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, enabled: true },
].filter((t) => t.enabled)

function useActiveLabel(): string | undefined {
  const location = useLocation()
  const match = [...primaryTabs, ...utilityTabs].find((t) =>
    location.pathname.startsWith(t.to),
  )
  return match?.label
}

export function AppShell() {
  const title = import.meta.env.VITE_APP_TITLE ?? 'Investment Dashboard'
  const activeLabel = useActiveLabel()

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hairline-r sticky top-0 hidden h-screen w-56 shrink-0 flex-col px-3 py-5 md:flex">
        <div className="flex items-center gap-2.5 px-2.5 pb-5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rotate-45 bg-tick-400"
          />
          <span className="text-[13px] font-semibold tracking-tight text-bone-50">
            {title}
          </span>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-0.5">
          {primaryTabs.map((t) => (
            <HoverTile key={t.to} variant="nudge">
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13.5px] font-medium transition ${
                    isActive
                      ? 'bg-act-400 text-ink-950'
                      : 'text-bone-300 hover:bg-ink-900 hover:text-bone-50'
                  }`
                }
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {t.label}
              </NavLink>
            </HoverTile>
          ))}
        </nav>

        <div className="hairline-t mt-auto flex flex-col gap-0.5 pt-3">
          {utilityTabs.map((t) => (
            <HoverTile key={t.to} variant="nudge">
              <NavLink
                to={t.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-full px-3 py-2 text-left text-[13.5px] font-medium transition ${
                    isActive
                      ? 'bg-act-400 text-ink-950'
                      : 'text-bone-300 hover:bg-ink-900 hover:text-bone-50'
                  }`
                }
              >
                <t.icon className="h-4 w-4 shrink-0" />
                {t.label}
              </NavLink>
            </HoverTile>
          ))}
        </div>
        <div className="px-2.5 pt-3 font-mono text-[10px] tracking-wide text-ink-400">
          ON-DEVICE · NO SERVER
        </div>
      </aside>

      {/* Top bar — mobile */}
      <header className="hairline-b sticky top-0 z-10 flex items-center justify-between gap-3 bg-ink-950/85 px-4 py-3 backdrop-blur md:hidden">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-bone-50">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rotate-45 bg-tick-400"
          />
          {activeLabel ?? title}
        </span>
        <NavLink
          to="/import"
          className="rounded-lg px-2.5 py-1 text-[11.5px] font-medium text-bone-300 hover:bg-bone-100/6"
        >
          Import
        </NavLink>
      </header>

      <main className="w-full min-w-0 max-w-[1600px] flex-1 px-5 pb-24 pt-8 sm:px-7 sm:pt-10 xl:px-11">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile */}
      <nav
        aria-label="Primary"
        className="hairline-t sticky bottom-0 z-10 grid grid-cols-4 bg-ink-950/94 backdrop-blur md:hidden"
      >
        {primaryTabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 py-2 text-[10.5px] ${
                isActive ? 'text-tick-200' : 'text-bone-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[26%] right-[26%] top-0 h-0.5 rounded-b-sm bg-tick-400"
                  />
                )}
                <t.icon className="h-[19px] w-[19px]" />
                {t.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function TodayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path d="M3 12l4-5 4 6 3-4 3 3 4-7" />
      <path d="M3 20h18" />
    </svg>
  )
}

function PortfolioIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
    </svg>
  )
}

function CashflowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path d="M3 6h18M3 12h12M3 18h7" />
    </svg>
  )
}

function PlanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  )
}

function ImportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.04 1.56V21a2 2 0 11-4 0v-.09A1.7 1.7 0 008.96 19.6a1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-1.56-1.04H3a2 2 0 110-4h.09A1.7 1.7 0 004.6 8.96a1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06A1.7 1.7 0 008.96 4.6a1.7 1.7 0 001.04-1.56V3a2 2 0 114 0v.09a1.7 1.7 0 001.04 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06A1.7 1.7 0 0019.4 8.96a1.7 1.7 0 001.56 1.04H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1.04z" />
    </svg>
  )
}
