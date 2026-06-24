export type OpenCordSettingsPanel =
  | 'account'
  | 'server-connections'
  | 'voice-video'
  | 'privacy-permissions'
  | 'notifications'
  | 'appearance'
  | 'developer'
  | 'native-call-integration'

export type OpenCordDeveloperPanel = 'overview' | 'bots' | 'webhooks' | 'audit' | 'commands'

export type OpenCordRouteTarget =
  | {
      kind: 'server'
      serverId: string
    }
  | {
      kind: 'organization'
      serverId: string
      organizationId: string
    }
  | {
      kind: 'space'
      serverId: string
      organizationId: string
      spaceId: string
    }
  | {
      kind: 'channel'
      serverId: string
      organizationId?: string
      spaceId: string
      channelId: string
    }
  | {
      kind: 'message'
      serverId: string
      organizationId?: string
      spaceId: string
      channelId: string
      messageId: string
    }
  | {
      kind: 'meeting'
      serverId?: string
      organizationId?: string
      spaceId?: string
      channelId?: string
      meetingId: string
    }
  | {
      kind: 'settings'
      serverId?: string
      panel: OpenCordSettingsPanel
    }
  | {
      kind: 'developer'
      serverId: string
      organizationId?: string
      spaceId?: string
      channelId?: string
      panel: OpenCordDeveloperPanel
    }

export type OpenCordAttachmentView = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  previewUrl?: string
  downloadUrl?: string
}

export type OpenCordRichEmbedView = {
  type?: 'rich'
  title?: string
  description?: string
  url?: string
  timestamp?: string
  color?: number
  author?: {
    name: string
    url?: string
    iconUrl?: string
  }
  footer?: {
    text: string
    iconUrl?: string
  }
  image?: {
    url: string
  }
  thumbnail?: {
    url: string
  }
  fields?: OpenCordRichEmbedFieldView[]
}

export type OpenCordRichEmbedFieldView = {
  name: string
  value: string
  inline?: boolean
}

export type OpenCordMessageView = {
  id: string
  channelId: string
  authorId?: string
  authorName: string
  authorKind: 'user' | 'bot' | 'webhook' | 'system'
  content: string
  createdAt: string
  editedAt?: string
  own: boolean
  attachments: OpenCordAttachmentView[]
  embeds: OpenCordRichEmbedView[]
}

export type OpenCordMeetingView = {
  id: string
  channelId?: string
  title: string
  startsAt: string
  endsAt: string
  organizerName: string
  status: 'scheduled' | 'cancelled'
  joinUrl?: string
}

export type OpenCordMemberPresenceView = {
  memberId: string
  displayName: string
  role?: string
  presence: 'online' | 'idle' | 'offline'
  activity?: string
}

export type OpenCordNotificationRoute = {
  id: string
  title: string
  body: string
  target: OpenCordRouteTarget
  receivedAt: string
}

const settingsPanels = [
  'account',
  'server-connections',
  'voice-video',
  'privacy-permissions',
  'notifications',
  'appearance',
  'developer',
  'native-call-integration',
] satisfies OpenCordSettingsPanel[]

const developerPanels = [
  'overview',
  'bots',
  'webhooks',
  'audit',
  'commands',
] satisfies OpenCordDeveloperPanel[]

export function parseOpenCordRouteTarget(value: unknown): OpenCordRouteTarget | null {
  const payload = objectValue(value)
  if (!payload) {
    return null
  }

  const kind = stringValue(payload.kind)
  switch (kind) {
    case 'server': {
      const serverId = nonEmptyStringValue(payload.serverId)
      return serverId ? { kind, serverId } : null
    }
    case 'organization': {
      const serverId = nonEmptyStringValue(payload.serverId)
      const organizationId = nonEmptyStringValue(payload.organizationId)
      return serverId && organizationId ? { kind, serverId, organizationId } : null
    }
    case 'space': {
      const serverId = nonEmptyStringValue(payload.serverId)
      const organizationId = nonEmptyStringValue(payload.organizationId)
      const spaceId = nonEmptyStringValue(payload.spaceId)
      return serverId && organizationId && spaceId
        ? { kind, serverId, organizationId, spaceId }
        : null
    }
    case 'channel': {
      const serverId = nonEmptyStringValue(payload.serverId)
      const spaceId = nonEmptyStringValue(payload.spaceId)
      const channelId = nonEmptyStringValue(payload.channelId)
      if (!serverId || !spaceId || !channelId) {
        return null
      }

      const organizationId = nonEmptyStringValue(payload.organizationId)
      return organizationId
        ? { kind, serverId, organizationId, spaceId, channelId }
        : { kind, serverId, spaceId, channelId }
    }
    case 'message': {
      const serverId = nonEmptyStringValue(payload.serverId)
      const spaceId = nonEmptyStringValue(payload.spaceId)
      const channelId = nonEmptyStringValue(payload.channelId)
      const messageId = nonEmptyStringValue(payload.messageId)
      if (!serverId || !spaceId || !channelId || !messageId) {
        return null
      }

      const organizationId = nonEmptyStringValue(payload.organizationId)
      return organizationId
        ? { kind, serverId, organizationId, spaceId, channelId, messageId }
        : { kind, serverId, spaceId, channelId, messageId }
    }
    case 'meeting': {
      const meetingId = nonEmptyStringValue(payload.meetingId)
      if (!meetingId) {
        return null
      }

      return optionalMeetingContext({ kind, meetingId }, payload)
    }
    case 'settings': {
      const panel = settingsPanelValue(payload.panel)
      if (!panel) {
        return null
      }

      const serverId = nonEmptyStringValue(payload.serverId)
      return serverId ? { kind, serverId, panel } : { kind, panel }
    }
    case 'developer': {
      const serverId = nonEmptyStringValue(payload.serverId)
      const panel = developerPanelValue(payload.panel)
      if (!serverId || !panel) {
        return null
      }

      return optionalDeveloperContext({ kind, serverId, panel }, payload)
    }
    default:
      return null
  }
}

export function buildOpenCordDeepLink(target: OpenCordRouteTarget) {
  const normalized = parseOpenCordRouteTarget(target)
  if (!normalized) {
    throw new Error('Invalid OpenCord route target.')
  }

  const params = new URLSearchParams()
  appendTargetParams(params, normalized)
  return `opencord://route?${params.toString()}`
}

export function parseOpenCordDeepLink(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'opencord:' || url.host !== 'route') {
      return null
    }

    return parseOpenCordRouteTarget(Object.fromEntries(url.searchParams.entries()))
  } catch {
    return null
  }
}

export function buildOpenCordRoutePath(target: OpenCordRouteTarget) {
  const normalized = parseOpenCordRouteTarget(target)
  if (!normalized) {
    throw new Error('Invalid OpenCord route target.')
  }

  switch (normalized.kind) {
    case 'server':
      return `/servers/${pathSegment(normalized.serverId)}`
    case 'organization':
      return `/servers/${pathSegment(normalized.serverId)}/organizations/${pathSegment(
        normalized.organizationId,
      )}`
    case 'space':
      return `/servers/${pathSegment(normalized.serverId)}/spaces/${pathSegment(normalized.spaceId)}`
    case 'channel':
      return channelRoutePath(normalized)
    case 'message':
      return `${channelRoutePath(normalized)}?messageId=${queryValue(normalized.messageId)}`
    case 'meeting':
      if (normalized.serverId && normalized.spaceId && normalized.channelId) {
        return `${channelRoutePath({
          serverId: normalized.serverId,
          spaceId: normalized.spaceId,
          channelId: normalized.channelId,
        })}/meetings/${pathSegment(normalized.meetingId)}`
      }

      return `/meetings/${pathSegment(normalized.meetingId)}`
    case 'settings':
      return routeWithQuery('/settings', {
        serverId: normalized.serverId,
        panel: normalized.panel,
      })
    case 'developer':
      if (normalized.spaceId && normalized.channelId) {
        return routeWithQuery(
          `${channelRoutePath({
            serverId: normalized.serverId,
            spaceId: normalized.spaceId,
            channelId: normalized.channelId,
          })}/developers`,
          { panel: normalized.panel },
        )
      }

      return routeWithQuery('/developers', {
        serverId: normalized.serverId,
        panel: normalized.panel,
      })
  }
}

function appendTargetParams(params: URLSearchParams, target: OpenCordRouteTarget) {
  params.set('kind', target.kind)
  appendOptional(params, 'serverId', target.serverId)

  if ('organizationId' in target) {
    appendOptional(params, 'organizationId', target.organizationId)
  }
  if ('spaceId' in target) {
    appendOptional(params, 'spaceId', target.spaceId)
  }
  if ('channelId' in target) {
    appendOptional(params, 'channelId', target.channelId)
  }
  if ('messageId' in target) {
    appendOptional(params, 'messageId', target.messageId)
  }
  if ('meetingId' in target) {
    appendOptional(params, 'meetingId', target.meetingId)
  }
  if ('panel' in target) {
    appendOptional(params, 'panel', target.panel)
  }
}

function appendOptional(params: URLSearchParams, key: string, value: string | undefined) {
  if (value) {
    params.set(key, value)
  }
}

function channelRoutePath(target: {
  serverId: string
  spaceId: string
  channelId: string
}) {
  return `/servers/${pathSegment(target.serverId)}/spaces/${pathSegment(
    target.spaceId,
  )}/channels/${pathSegment(target.channelId)}`
}

function routeWithQuery(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    appendOptional(query, key, value)
  }

  const queryString = query.toString()
  return queryString ? `${path}?${queryString}` : path
}

function optionalMeetingContext(
  target: Extract<OpenCordRouteTarget, { kind: 'meeting' }>,
  payload: Record<string, unknown>,
) {
  const serverId = nonEmptyStringValue(payload.serverId)
  const organizationId = nonEmptyStringValue(payload.organizationId)
  const spaceId = nonEmptyStringValue(payload.spaceId)
  const channelId = nonEmptyStringValue(payload.channelId)

  return {
    ...target,
    ...(serverId ? { serverId } : {}),
    ...(organizationId ? { organizationId } : {}),
    ...(spaceId ? { spaceId } : {}),
    ...(channelId ? { channelId } : {}),
  }
}

function optionalDeveloperContext(
  target: Extract<OpenCordRouteTarget, { kind: 'developer' }>,
  payload: Record<string, unknown>,
) {
  const organizationId = nonEmptyStringValue(payload.organizationId)
  const spaceId = nonEmptyStringValue(payload.spaceId)
  const channelId = nonEmptyStringValue(payload.channelId)

  return {
    ...target,
    ...(organizationId ? { organizationId } : {}),
    ...(spaceId ? { spaceId } : {}),
    ...(channelId ? { channelId } : {}),
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : null
}

function nonEmptyStringValue(value: unknown) {
  const text = stringValue(value)?.trim()
  return text ? text : null
}

function settingsPanelValue(value: unknown): OpenCordSettingsPanel | null {
  return settingsPanels.find((panel) => panel === value) ?? null
}

function developerPanelValue(value: unknown): OpenCordDeveloperPanel | null {
  return developerPanels.find((panel) => panel === value) ?? null
}

function pathSegment(value: string) {
  return encodeURIComponent(value)
}

function queryValue(value: string) {
  return encodeURIComponent(value)
}
