import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  type RouterHistory,
} from '@tanstack/react-router'

import { WorkspaceShell } from '../features/workspace/WorkspaceShell'
import { useWorkspaceUiStore } from '../features/workspace/state/workspaceUiStore'
import type { ActivePanel } from '../features/workspace/workspaceTypes'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <WorkspaceRoute panel="chat" />,
})

const channelRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/servers/$serverId/spaces/$spaceId/channels/$channelId',
  component: () => <WorkspaceRoute panel="chat" />,
})

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/servers/$serverId/spaces/$spaceId/channels/$channelId/calendar',
  component: () => <WorkspaceRoute panel="calendar" />,
})

const calendarShortcutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: () => <WorkspaceRoute panel="calendar" />,
})

const developerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/servers/$serverId/spaces/$spaceId/channels/$channelId/developers',
  component: () => <WorkspaceRoute panel="developers" />,
})

const developerShortcutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/developers',
  component: () => <WorkspaceRoute panel="developers" />,
})

const meetingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/servers/$serverId/spaces/$spaceId/channels/$channelId/meetings/$meetingId',
  component: MeetingWorkspaceRoute,
})

const meetingShortcutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/meetings/$meetingId',
  component: MeetingShortcutWorkspaceRoute,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  channelRoute,
  calendarRoute,
  calendarShortcutRoute,
  developerRoute,
  developerShortcutRoute,
  meetingRoute,
  meetingShortcutRoute,
])

export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    history: options.history,
    defaultPreload: 'intent',
  })
}

export const router = createAppRouter()

export type AppRouter = typeof router

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function WorkspaceRoute({ panel, meetingId }: { panel: ActivePanel; meetingId?: string }) {
  useWorkspaceUiStore.getState().setRouteContext({ panel })

  return <WorkspaceShell initialMeetingId={meetingId} initialPanel={panel} />
}

function MeetingWorkspaceRoute() {
  const { meetingId } = meetingRoute.useParams()

  return <WorkspaceRoute meetingId={meetingId} panel="meeting" />
}

function MeetingShortcutWorkspaceRoute() {
  const { meetingId } = meetingShortcutRoute.useParams()

  return <WorkspaceRoute meetingId={meetingId} panel="meeting" />
}
