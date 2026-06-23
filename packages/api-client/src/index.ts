export const DEFAULT_OPENCORD_SERVER_URL = 'http://localhost:8080'

export type OpenCordFetch = (input: string, init?: RequestInit) => Promise<Response>

export type ServerHealth =
  | { status: 'online'; version: string }
  | { status: 'offline'; message: string }

export type WellKnownResponse = {
  server: string
  version: string
  apiBaseUrl: string
  realtimeUrl: string
}

export type ServerDiscovery = {
  wellKnown: WellKnownResponse
  version: string
  capabilities: string[]
}

export type PushPlatform = 'ios' | 'android' | 'web' | 'desktop'

export type RegisterPushTokenRequest = {
  platform: PushPlatform
  token: string
  deviceName?: string
}

export type PushToken = {
  id: string
  userId: string
  platform: PushPlatform
  tokenLastFour: string
  deviceName: string | null
  createdAt: string
  updatedAt: string
}

export type JoinVoiceChannelRequest = {
  selfMute?: boolean
  selfDeaf?: boolean
}

export type MediaTokenGrants = {
  canPublishAudio: boolean
  canPublishVideo: boolean
  canPublishScreen: boolean
  canSubscribe: boolean
}

export type MediaRoomToken = {
  provider: string
  serverUrl: string
  region: string
  roomType: string
  roomName: string
  organizationId: string
  spaceId: string
  channelId: string
  participantIdentity: string
  participantToken: string
  expiresAt: string
  grants: MediaTokenGrants
}

export type VoiceParticipant = {
  channelId: string
  userId: string
  selfMute: boolean
  selfDeaf: boolean
}

export type VoiceJoin = {
  voice: VoiceParticipant
  media: MediaRoomToken
}

export type OpenCordApiClientOptions = {
  baseUrl?: string
  fetch?: OpenCordFetch
  sessionToken?: string
}

type WellKnownPayload = {
  server?: unknown
  version?: unknown
  api_base_url?: unknown
  realtime_url?: unknown
}

type VersionPayload = {
  version?: unknown
}

type CapabilitiesPayload = {
  capabilities?: unknown
}

type PushTokenPayload = {
  id?: unknown
  user_id?: unknown
  platform?: unknown
  token_last_four?: unknown
  device_name?: unknown
  created_at?: unknown
  updated_at?: unknown
}

type PushTokenResourcePayload = {
  push_token?: unknown
}

type PushTokenListPayload = {
  push_tokens?: unknown
}

type MediaTokenGrantsPayload = {
  can_publish_audio?: unknown
  can_publish_video?: unknown
  can_publish_screen?: unknown
  can_subscribe?: unknown
}

type MediaRoomTokenPayload = {
  provider?: unknown
  server_url?: unknown
  region?: unknown
  room_type?: unknown
  room_name?: unknown
  organization_id?: unknown
  space_id?: unknown
  channel_id?: unknown
  participant_identity?: unknown
  participant_token?: unknown
  expires_at?: unknown
  grants?: unknown
}

type VoiceParticipantPayload = {
  channel_id?: unknown
  user_id?: unknown
  self_mute?: unknown
  self_deaf?: unknown
}

type VoiceJoinPayload = {
  voice?: unknown
  media?: unknown
}

type ErrorPayload = {
  error?: {
    message?: unknown
  }
}

const jsonHeaders = { Accept: 'application/json' } as const

export class OpenCordApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'OpenCordApiError'
    this.status = status
    this.body = body
  }
}

export class OpenCordApiClient {
  readonly baseUrl: string

  private readonly fetchImpl: OpenCordFetch
  private readonly sessionToken?: string

  constructor(options: OpenCordApiClientOptions = {}) {
    this.baseUrl = normalizeOpenCordBaseUrl(options.baseUrl)
    this.fetchImpl = options.fetch ?? defaultFetch
    this.sessionToken = normalizeSessionToken(options.sessionToken)
  }

  endpoint(path: string) {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  }

  async health(): Promise<ServerHealth> {
    try {
      const response = await this.fetchImpl(this.endpoint('/healthz'), {
        headers: jsonHeaders,
      })

      if (!response.ok) {
        return { status: 'offline', message: `HTTP ${response.status}` }
      }

      const payload = (await response.json()) as VersionPayload & { status?: unknown }
      if (payload.status !== 'ok') {
        return { status: 'offline', message: 'Health response was not ok' }
      }

      return { status: 'online', version: stringValue(payload.version, 'unknown') }
    } catch (error) {
      return {
        status: 'offline',
        message: error instanceof Error ? error.message : 'Unable to reach server',
      }
    }
  }

  async wellKnown(): Promise<WellKnownResponse> {
    const payload = await this.requestJson<WellKnownPayload>('/.well-known/opencord')

    return {
      server: stringValue(payload.server, 'opencord'),
      version: stringValue(payload.version, 'unknown'),
      apiBaseUrl: stringValue(payload.api_base_url, this.endpoint('/api')),
      realtimeUrl: stringValue(payload.realtime_url, websocketUrl(this.baseUrl)),
    }
  }

  async version(): Promise<string> {
    const payload = await this.requestJson<VersionPayload>('/api/version')
    return stringValue(payload.version, 'unknown')
  }

  async capabilities(): Promise<string[]> {
    const payload = await this.requestJson<CapabilitiesPayload>('/api/capabilities')
    if (!Array.isArray(payload.capabilities)) {
      return []
    }

    return payload.capabilities.filter((capability): capability is string => {
      return typeof capability === 'string'
    })
  }

  async discover(): Promise<ServerDiscovery> {
    const [wellKnown, version, capabilities] = await Promise.all([
      this.wellKnown(),
      this.version(),
      this.capabilities(),
    ])

    return { wellKnown, version, capabilities }
  }

  async registerPushToken(request: RegisterPushTokenRequest): Promise<PushToken> {
    const payload = await this.requestJson<PushTokenResourcePayload>('/push-tokens', {
      body: JSON.stringify({
        platform: request.platform,
        token: request.token,
        device_name: request.deviceName,
      }),
      method: 'POST',
    })

    return pushTokenFromPayload(payload.push_token)
  }

  async listPushTokens(): Promise<PushToken[]> {
    const payload = await this.requestJson<PushTokenListPayload>('/push-tokens')
    if (!Array.isArray(payload.push_tokens)) {
      return []
    }

    return payload.push_tokens.map(pushTokenFromPayload)
  }

  async joinVoiceChannel(
    channelId: string,
    request: JoinVoiceChannelRequest = {},
  ): Promise<VoiceJoin> {
    const payload = await this.requestJson<VoiceJoinPayload>(
      `/voice/channels/${encodeURIComponent(channelId)}/join`,
      {
        body: JSON.stringify({
          self_mute: request.selfMute,
          self_deaf: request.selfDeaf,
        }),
        method: 'POST',
      },
    )

    return {
      voice: voiceParticipantFromPayload(payload.voice),
      media: mediaRoomTokenFromPayload(payload.media),
    }
  }

  private async requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(this.endpoint(path), {
      ...init,
      headers: this.requestHeaders(init),
    })
    const payload = await parseJson(response)

    if (!response.ok) {
      throw new OpenCordApiError(response.status, errorMessage(payload, response.status), payload)
    }

    return payload as T
  }

  private requestHeaders(init: RequestInit): Record<string, string> {
    const headers: Record<string, string> = { ...jsonHeaders }
    if (this.sessionToken) {
      headers.Authorization = `Bearer ${this.sessionToken}`
    }
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    return headers
  }
}

export function createOpenCordApiClient(options: OpenCordApiClientOptions = {}) {
  return new OpenCordApiClient(options)
}

export function normalizeOpenCordBaseUrl(value = DEFAULT_OPENCORD_SERVER_URL) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new TypeError('OpenCord server URL is required')
  }

  return trimmed
}

function normalizeSessionToken(value?: string) {
  const token = value?.trim()
  return token || undefined
}

async function defaultFetch(input: string, init?: RequestInit) {
  return fetch(input, init)
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as unknown
  } catch {
    return undefined
  }
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback
}

function nullableStringValue(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  return typeof value === 'string' ? value : null
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function pushPlatformValue(value: unknown): PushPlatform {
  if (value === 'ios' || value === 'android' || value === 'web' || value === 'desktop') {
    return value
  }

  return 'web'
}

function mediaTokenGrantsFromPayload(value: unknown): MediaTokenGrants {
  const payload = objectValue(value) as MediaTokenGrantsPayload

  return {
    canPublishAudio: booleanValue(payload.can_publish_audio, false),
    canPublishVideo: booleanValue(payload.can_publish_video, false),
    canPublishScreen: booleanValue(payload.can_publish_screen, false),
    canSubscribe: booleanValue(payload.can_subscribe, true),
  }
}

function mediaRoomTokenFromPayload(value: unknown): MediaRoomToken {
  const payload = objectValue(value) as MediaRoomTokenPayload

  return {
    provider: stringValue(payload.provider, 'livekit'),
    serverUrl: stringValue(payload.server_url, ''),
    region: stringValue(payload.region, 'local'),
    roomType: stringValue(payload.room_type, 'voice_channel'),
    roomName: stringValue(payload.room_name, ''),
    organizationId: stringValue(payload.organization_id, ''),
    spaceId: stringValue(payload.space_id, ''),
    channelId: stringValue(payload.channel_id, ''),
    participantIdentity: stringValue(payload.participant_identity, ''),
    participantToken: stringValue(payload.participant_token, ''),
    expiresAt: stringValue(payload.expires_at, ''),
    grants: mediaTokenGrantsFromPayload(payload.grants),
  }
}

function voiceParticipantFromPayload(value: unknown): VoiceParticipant {
  const payload = objectValue(value) as VoiceParticipantPayload

  return {
    channelId: stringValue(payload.channel_id, ''),
    userId: stringValue(payload.user_id, ''),
    selfMute: booleanValue(payload.self_mute, false),
    selfDeaf: booleanValue(payload.self_deaf, false),
  }
}

function pushTokenFromPayload(value: unknown): PushToken {
  const payload = objectValue(value) as PushTokenPayload

  return {
    id: stringValue(payload.id, ''),
    userId: stringValue(payload.user_id, ''),
    platform: pushPlatformValue(payload.platform),
    tokenLastFour: stringValue(payload.token_last_four, ''),
    deviceName: nullableStringValue(payload.device_name),
    createdAt: stringValue(payload.created_at, ''),
    updatedAt: stringValue(payload.updated_at, ''),
  }
}

function objectValue(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function errorMessage(payload: unknown, status: number) {
  const error = payload as ErrorPayload | undefined
  if (typeof error?.error?.message === 'string' && error.error.message) {
    return error.error.message
  }

  return `HTTP ${status}`
}

function websocketUrl(baseUrl: string) {
  if (baseUrl.startsWith('https://')) {
    return `wss://${baseUrl.slice('https://'.length)}/ws`
  }

  if (baseUrl.startsWith('http://')) {
    return `ws://${baseUrl.slice('http://'.length)}/ws`
  }

  return `${baseUrl}/ws`
}
