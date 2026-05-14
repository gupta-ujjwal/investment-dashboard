import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/analytics', label: 'Analytics' },
  { to: '/holdings', label: 'Holdings' },
  { to: '/settings', label: 'Settings' },
]

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
          <nav>
            <ul className="flex items-center gap-1">
              {tabs.map((t) => (
                <li key={t.to}>
                  <NavLink
                    to={t.to}
                    className={({ isActive }) =>
                      `relative inline-block px-3 py-2 font-sans text-[12px] font-medium uppercase tracking-[0.16em] transition sm:px-4 sm:text-[13px] ${
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
