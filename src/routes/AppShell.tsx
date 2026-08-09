import { NavLink, Outlet } from 'react-router-dom'
import { FEATURE_ASSETS, FEATURE_BUDGET, FEATURE_PLANNING } from '../featureFlags'

const tabs = [
  { to: '/overview', label: 'Overview', icon: OverviewIcon, enabled: true },
  { to: '/investments', label: 'Investments', icon: InvestmentsIcon, enabled: FEATURE_ASSETS },
  { to: '/equity', label: 'Equity', icon: EquityIcon, enabled: true },
  { to: '/budget', label: 'Budget', icon: BudgetIcon, enabled: FEATURE_BUDGET },
  { to: '/planning', label: 'Planning', icon: PlanningIcon, enabled: FEATURE_PLANNING },
  { to: '/import', label: 'Import', icon: ImportIcon, enabled: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, enabled: true },
].filter((t) => t.enabled)

export function AppShell() {
  const title = import.meta.env.VITE_APP_TITLE ?? 'Investment Dashboard'

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-bone-100/10 px-4 py-6 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rotate-45 bg-tick-400"
          />
          <span className="text-sm font-medium tracking-tight text-bone-50">
            {title}
          </span>
        </div>

        <nav aria-label="Primary" className="mt-8 flex flex-col gap-0.5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-lg border-l-2 px-2.5 py-2 text-left text-[13.5px] transition ${
                  isActive
                    ? 'border-tick-400 bg-tick-400/14 text-tick-200'
                    : 'border-transparent text-bone-300 hover:bg-bone-100/6'
                }`
              }
            >
              <t.icon className="h-4 w-4 shrink-0" />
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 px-2 text-[11.5px] leading-relaxed text-bone-500">
          <div>All data stored on-device</div>
        </div>
      </aside>

      {/* Top bar — mobile */}
      <header className="sticky top-0 z-10 border-b border-bone-100/10 bg-ink-950/85 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rotate-45 bg-tick-400"
            />
            <span className="text-sm font-medium tracking-tight text-bone-50">
              {title}
            </span>
          </div>
        </div>
        <nav
          aria-label="Primary"
          className="min-w-0 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex items-center gap-1 whitespace-nowrap">
            {tabs.map((t) => (
              <li key={t.to}>
                <NavLink
                  to={t.to}
                  className={({ isActive }) =>
                    `inline-block rounded-lg px-3 py-1.5 text-[13px] font-medium transition ${
                      isActive
                        ? 'bg-tick-400/14 text-tick-200'
                        : 'text-bone-400 hover:text-bone-100'
                    }`
                  }
                >
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="w-full min-w-0 px-5 pb-24 pt-8 sm:px-8 sm:pt-10 md:max-w-5xl">
        <Outlet />
      </main>
    </div>
  )
}

function OverviewIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x="3" y="12" width="4" height="9" />
      <rect x="10" y="7" width="4" height="14" />
      <rect x="17" y="3" width="4" height="18" />
    </svg>
  )
}

function InvestmentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  )
}

function EquityIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <path d="M3 17l5-6 4 4 8-9" />
    </svg>
  )
}

function BudgetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
  )
}

function PlanningIcon({ className }: { className?: string }) {
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
