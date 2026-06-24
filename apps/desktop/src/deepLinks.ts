export const DEEP_LINK_ROUTE_CHANNEL = 'opencord:deep-link:route'

export type DesktopRouteTarget = {
  kind: string
  serverId?: string
  organizationId?: string
  spaceId?: string
  channelId?: string
  messageId?: string
  meetingId?: string
  panel?: string
}

export type DesktopDeepLinkRoute = {
  routePath: string
  target: DesktopRouteTarget
}

const settingsPanels = new Set([
  'account',
  'server-connections',
  'voice-video',
  'privacy-permissions',
  'notifications',
  'appearance',
  'developer',
  'native-call-integration',
])

const developerPanels = new Set(['overview', 'bots', 'webhooks', 'audit', 'commands'])

export function parseDesktopDeepLinkRoute(value: string): DesktopDeepLinkRoute | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'opencord:' || url.host !== 'route') {
    return null
  }

  const target = routeTargetFromParams(url.searchParams)
  if (!target) {
    return null
  }

  const routePath = routePathForDesktopTarget(target)
  return routePath ? { routePath, target } : null
}

export function firstDesktopDeepLinkArg(argv: readonly string[]) {
  return argv.find((arg) => parseDesktopDeepLinkRoute(arg) !== null) ?? null
}

export function isDesktopDeepLinkRoute(value: unknown): value is DesktopDeepLinkRoute {
  if (!isObject(value) || !isSafeRendererRoutePath(value.routePath) || !isObject(value.target)) {
    return false
  }

  return typeof value.target.kind === 'string' && value.target.kind.trim().length > 0
}

function routeTargetFromParams(params: URLSearchParams): DesktopRouteTarget | null {
  const kind = stringParam(params, 'kind')
  switch (kind) {
    case 'server': {
      const serverId = stringParam(params, 'serverId')
      return serverId ? { kind, serverId } : null
    }
    case 'organization': {
      const serverId = stringParam(params, 'serverId')
      const organizationId = stringParam(params, 'organizationId')
      return serverId && organizationId ? { kind, serverId, organizationId } : null
    }
    case 'space': {
      const serverId = stringParam(params, 'serverId')
      const organizationId = stringParam(params, 'organizationId')
      const spaceId = stringParam(params, 'spaceId')
      return serverId && organizationId && spaceId
        ? { kind, serverId, organizationId, spaceId }
        : null
    }
    case 'channel': {
      const serverId = stringParam(params, 'serverId')
      const organizationId = stringParam(params, 'organizationId')
      const spaceId = stringParam(params, 'spaceId')
      const channelId = stringParam(params, 'channelId')
      return serverId && spaceId && channelId
        ? optionalTarget({ kind, serverId, spaceId, channelId }, { organizationId })
        : null
    }
    case 'message': {
      const serverId = stringParam(params, 'serverId')
      const organizationId = stringParam(params, 'organizationId')
      const spaceId = stringParam(params, 'spaceId')
      const channelId = stringParam(params, 'channelId')
      const messageId = stringParam(params, 'messageId')
      return serverId && spaceId && channelId && messageId
        ? optionalTarget({ kind, serverId, spaceId, channelId, messageId }, { organizationId })
        : null
    }
    case 'meeting': {
      const meetingId = stringParam(params, 'meetingId')
      if (!meetingId) {
        return null
      }

      return optionalTarget(
        { kind, meetingId },
        {
          channelId: stringParam(params, 'channelId'),
          organizationId: stringParam(params, 'organizationId'),
          serverId: stringParam(params, 'serverId'),
          spaceId: stringParam(params, 'spaceId'),
        },
      )
    }
    case 'settings': {
      const panel = stringParam(params, 'panel')
      if (!panel || !settingsPanels.has(panel)) {
        return null
      }

      return optionalTarget({ kind, panel }, { serverId: stringParam(params, 'serverId') })
    }
    case 'developer': {
      const serverId = stringParam(params, 'serverId')
      const panel = stringParam(params, 'panel')
      if (!serverId || !panel || !developerPanels.has(panel)) {
        return null
      }

      return optionalTarget(
        { kind, serverId, panel },
        {
          channelId: stringParam(params, 'channelId'),
          organizationId: stringParam(params, 'organizationId'),
          spaceId: stringParam(params, 'spaceId'),
        },
      )
    }
    default:
      return null
  }
}

function routePathForDesktopTarget(target: DesktopRouteTarget) {
  switch (target.kind) {
    case 'server':
      return target.serverId ? `/servers/${pathSegment(target.serverId)}` : null
    case 'organization':
      return target.serverId && target.organizationId
        ? `/servers/${pathSegment(target.serverId)}/organizations/${pathSegment(
            target.organizationId,
          )}`
        : null
    case 'space':
      return target.serverId && target.spaceId
        ? `/servers/${pathSegment(target.serverId)}/spaces/${pathSegment(target.spaceId)}`
        : null
    case 'channel':
      return channelRoutePath(target)
    case 'message': {
      const channelPath = channelRoutePath(target)
      return channelPath && target.messageId
        ? `${channelPath}?messageId=${queryValue(target.messageId)}`
        : null
    }
    case 'meeting':
      if (target.serverId && target.spaceId && target.channelId) {
        const channelPath = channelRoutePath(target)
        return channelPath && target.meetingId
          ? `${channelPath}/meetings/${pathSegment(target.meetingId)}`
          : null
      }

      return target.meetingId ? `/meetings/${pathSegment(target.meetingId)}` : null
    case 'settings':
      return target.panel
        ? routeWithQuery('/settings', { panel: target.panel, serverId: target.serverId })
        : null
    case 'developer':
      if (target.spaceId && target.channelId) {
        const channelPath = channelRoutePath(target)
        return channelPath && target.panel
          ? routeWithQuery(`${channelPath}/developers`, { panel: target.panel })
          : null
      }

      return target.serverId && target.panel
        ? routeWithQuery('/developers', { panel: target.panel, serverId: target.serverId })
        : null
    default:
      return null
  }
}

function channelRoutePath(target: DesktopRouteTarget) {
  return target.serverId && target.spaceId && target.channelId
    ? `/servers/${pathSegment(target.serverId)}/spaces/${pathSegment(
        target.spaceId,
      )}/channels/${pathSegment(target.channelId)}`
    : null
}

function routeWithQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value)
    }
  }

  const queryString = query.toString()
  return queryString ? `${path}?${queryString}` : path
}

function stringParam(params: URLSearchParams, name: string) {
  const value = params.get(name)?.trim()
  return value ? value : null
}

function optionalTarget<T extends DesktopRouteTarget>(
  target: T,
  optionalValues: Partial<Record<keyof DesktopRouteTarget, string | null | undefined>>,
) {
  return Object.fromEntries(
    Object.entries({ ...target, ...optionalValues }).filter(([, value]) => Boolean(value)),
  ) as T
}

function isSafeRendererRoutePath(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function pathSegment(value: string) {
  return encodeURIComponent(value)
}

function queryValue(value: string) {
  return encodeURIComponent(value)
}
