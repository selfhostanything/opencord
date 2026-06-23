import { create } from 'zustand'

import type { ActivePanel } from '../workspaceTypes'

export type WorkspaceRouteContext = {
  panel: ActivePanel
  serverId?: string
  spaceId?: string
  channelId?: string
  meetingId?: string
}

type WorkspaceUiState = {
  routeContext: WorkspaceRouteContext
  setRouteContext: (context: WorkspaceRouteContext) => void
}

export const useWorkspaceUiStore = create<WorkspaceUiState>((set) => ({
  routeContext: { panel: 'chat' },
  setRouteContext: (routeContext) => set({ routeContext }),
}))
