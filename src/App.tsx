import { createBrowserRouter, redirect, RouterProvider } from 'react-router-dom'
import { getAll } from './storage/holdings'
import { HomeRoute } from './routes/home/HomeRoute'
import { ImportRoute } from './routes/import/ImportRoute'

const router = createBrowserRouter(
  [
    {
      path: '/',
      Component: HomeRoute,
      loader: async () => {
        const holdings = await getAll()
        if (holdings.length === 0) {
          throw redirect('/import')
        }
        return holdings
      },
    },
    {
      path: '/import',
      Component: ImportRoute,
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
)

export default function App() {
  return <RouterProvider router={router} />
}
