import { RouterProvider } from '@tanstack/react-router'

import { AppProviders } from './providers'
import { router as defaultRouter, type AppRouter } from './router'

export type AppProps = {
  router?: AppRouter
}

export default function App({ router = defaultRouter }: AppProps) {
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
