import { createBrowserRouter, redirect, RouterProvider } from 'react-router-dom'
import { getAll } from './storage/holdings'
import { AppShell } from './routes/AppShell'
import { AnalyticsRoute } from './routes/AnalyticsRoute'
import { HoldingsRoute } from './routes/HoldingsRoute'
import { SettingsRoute } from './routes/SettingsRoute'

const holdingsLoader = async () => getAll()

const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: AppShell,
      children: [
        {
          index: true,
          loader: async () => {
            const holdings = await getAll()
            throw redirect(holdings.length === 0 ? '/settings' : '/analytics')
          },
        },
        { path: 'analytics', Component: AnalyticsRoute, loader: holdingsLoader },
        { path: 'holdings', Component: HoldingsRoute, loader: holdingsLoader },
        { path: 'settings', Component: SettingsRoute },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)

export default function App() {
  return <RouterProvider router={router} />
}
