import { RouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'

import { AppProviders } from './providers'
import { router as defaultRouter, type AppRouter } from './router'

export type AppProps = {
  router?: AppRouter
}

export default function App({ router = defaultRouter }: AppProps) {
  useEffect(() => {
    const unsubscribe = window.openCordDesktop?.deepLinks?.onRoute((route) => {
      if (!isSafeRendererRoutePath(route.routePath)) {
        return
      }

      const navigate = router.navigate as (options: { to: string }) => Promise<void>
      void navigate({ to: route.routePath })
    })

    return () => {
      unsubscribe?.()
    }
  }, [router])

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  )
}

function isSafeRendererRoutePath(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}
