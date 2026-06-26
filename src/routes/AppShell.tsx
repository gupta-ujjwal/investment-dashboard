import { NavLink, Outlet } from 'react-router-dom'
import { FEATURE_ASSETS, FEATURE_BUDGET, FEATURE_PLANNING } from '../featureFlags'

// Net-worth-centric IA: Overview (generic, cross-asset) → Investments (all
// asset classes; equity backfilled read-only from holdings) → Equity (per-ticker
// table + equity analytics), then Budget / Planning, then the utility tabs
// (Import / Settings). Investments is gated on FEATURE_ASSETS so flipping that
// flag off removes the tab and its asset surface in lockstep. With up to seven
// tabs the nav overflows a 360px viewport, so the list is a horizontal scroll
// strip on mobile (see below).
const tabs = [
  { to: '/overview', label: 'Overview', enabled: true },
  { to: '/investments', label: 'Investments', enabled: FEATURE_ASSETS },
  { to: '/equity', label: 'Equity', enabled: true },
  { to: '/budget', label: 'Budget', enabled: FEATURE_BUDGET },
  { to: '/planning', label: 'Planning', enabled: FEATURE_PLANNING },
  { to: '/import', label: 'Import', enabled: true },
  { to: '/settings', label: 'Settings', enabled: true },
].filter((t) => t.enabled)

export function AppShell() {
  const title = import.meta.env.VITE_APP_TITLE ?? 'Investment Dashboard'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-bone-100/10 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rotate-45 bg-tick-400"
            />
            <span className="hidden font-sans text-sm font-medium tracking-tight text-bone-50 sm:inline">
              {title}
            </span>
          </div>
          <nav
            aria-label="Primary"
            // Horizontal scroll strip: up to six tabs cannot fit a 360px
            // viewport, so the list scrolls horizontally on mobile (scrollbar
            // hidden) and sits inline on ≥sm. `min-w-0` lets the nav shrink
            // inside the flex header instead of pushing the layout wider.
            className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ul className="flex items-center gap-1 whitespace-nowrap">
              {tabs.map((t) => (
                <li key={t.to}>
                  <NavLink
                    to={t.to}
                    className={({ isActive }) =>
                      `relative inline-block px-2 py-2 font-sans text-[10px] font-medium uppercase tracking-[0.14em] transition sm:px-4 sm:text-[13px] sm:tracking-[0.16em] ${
                        isActive
                          ? 'text-bone-50'
                          : 'text-bone-400 hover:text-bone-100'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {t.label}
                        <span
                          aria-hidden="true"
                          className={`absolute inset-x-2 -bottom-px h-px transition ${
                            isActive ? 'bg-tick-400' : 'bg-transparent'
                          }`}
                        />
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 pb-24 pt-8 sm:px-8 sm:pt-10">
        <Outlet />
      </main>
    </div>
  )
}
