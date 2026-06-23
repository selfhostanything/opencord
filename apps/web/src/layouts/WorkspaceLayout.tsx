import type { ReactNode } from 'react'

import type { ActivePanel } from '../features/workspace/workspaceTypes'

export function WorkspaceLayout({
  children,
  routePanel,
}: {
  children: ReactNode
  routePanel: ActivePanel
}) {
  return (
    <main className="app-shell" data-route-panel={routePanel}>
      {children}
    </main>
  )
}
