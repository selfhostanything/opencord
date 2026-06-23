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

export type AuthUser = {
  id: string
  email: string
  displayName: string
}

export type AuthSession = {
  token: string
}

export type AuthResult = {
  user: AuthUser
  session: AuthSession
}

export type OidcProvider = {
  organizationId: string
  issuer: string
  authorizationEndpoint: string
  tokenEndpoint: string
  jwksUri: string
  clientId: string
  allowedDomains: string[]
  requireSso: boolean
  autoJoinRole: string
}

export type CompleteOidcLoginRequest = {
  issuer: string
  subject: string
  email: string
  displayName: string
  emailVerified: boolean
  signature: string
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

export type MeetingAttendee = {
  id: string
  meetingId: string
  userId: string | null
  email: string | null
  displayName: string | null
  role: string
  responseStatus: string
}

export type MeetingReminder = {
  id: string
  meetingId: string
  recipientUserId: string | null
  recipientEmail: string | null
  channel: string
  offsetMinutes: number
  scheduledFor: string
  status: string
}

export type Meeting = {
  id: string
  organizationId: string
  spaceId: string | null
  channelId: string | null
  createdByUserId: string
  title: string
  description: string | null
  status: string
  startsAt: string
  endsAt: string
  timezone: string
  joinSlug: string
  joinUrl: string
  cancelledAt: string | null
  attendees: MeetingAttendee[]
  reminders: MeetingReminder[]
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

type AuthUserPayload = {
  id?: unknown
  email?: unknown
  display_name?: unknown
}

type AuthSessionPayload = {
  token?: unknown
}

type AuthResultPayload = {
  user?: unknown
  session?: unknown
}

type OidcProviderPayload = {
  organization_id?: unknown
  issuer?: unknown
  authorization_endpoint?: unknown
  token_endpoint?: unknown
  jwks_uri?: unknown
  client_id?: unknown
  allowed_domains?: unknown
  require_sso?: unknown
  auto_join_role?: unknown
}

type OidcProvidersPayload = {
  providers?: unknown
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

type MeetingAttendeePayload = {
  id?: unknown
  meeting_id?: unknown
  user_id?: unknown
  email?: unknown
  display_name?: unknown
  role?: unknown
  response_status?: unknown
}

type MeetingReminderPayload = {
  id?: unknown
  meeting_id?: unknown
  recipient_user_id?: unknown
  recipient_email?: unknown
  channel?: unknown
  offset_minutes?: unknown
  scheduled_for?: unknown
  status?: unknown
}

type MeetingPayload = {
  id?: unknown
  organization_id?: unknown
  space_id?: unknown
  channel_id?: unknown
  created_by_user_id?: unknown
  title?: unknown
  description?: unknown
  status?: unknown
  starts_at?: unknown
  ends_at?: unknown
  timezone?: unknown
  join_slug?: unknown
  join_url?: unknown
  cancelled_at?: unknown
  attendees?: unknown
  reminders?: unknown
}

type MeetingResourcePayload = {
  meeting?: unknown
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

  async oidcProvidersForEmail(email: string): Promise<OidcProvider[]> {
    const payload = await this.requestJson<OidcProvidersPayload>(
      `/auth/oidc/providers?email=${encodeURIComponent(email)}`,
    )

    return arrayValue(payload.providers).map(oidcProviderFromPayload)
  }

  async completeOidcLogin(request: CompleteOidcLoginRequest): Promise<AuthResult> {
    const payload = await this.requestJson<AuthResultPayload>('/auth/oidc/callback', {
      body: JSON.stringify({
        issuer: request.issuer,
        subject: request.subject,
        email: request.email,
        display_name: request.displayName,
        email_verified: request.emailVerified,
        signature: request.signature,
      }),
      method: 'POST',
    })

    return authResultFromPayload(payload)
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

  async resolveMeetingJoinUrl(joinSlug: string): Promise<Meeting> {
    const payload = await this.requestJson<MeetingResourcePayload>(
      `/join/${encodeURIComponent(joinSlug)}`,
    )

    return meetingFromPayload(payload.meeting)
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

function meetingFromPayload(value: unknown): Meeting {
  const payload = objectValue(value) as MeetingPayload

  return {
    id: stringValue(payload.id, ''),
    organizationId: stringValue(payload.organization_id, ''),
    spaceId: nullableStringValue(payload.space_id),
    channelId: nullableStringValue(payload.channel_id),
    createdByUserId: stringValue(payload.created_by_user_id, ''),
    title: stringValue(payload.title, ''),
    description: nullableStringValue(payload.description),
    status: stringValue(payload.status, 'scheduled'),
    startsAt: stringValue(payload.starts_at, ''),
    endsAt: stringValue(payload.ends_at, ''),
    timezone: stringValue(payload.timezone, 'UTC'),
    joinSlug: stringValue(payload.join_slug, ''),
    joinUrl: stringValue(payload.join_url, ''),
    cancelledAt: nullableStringValue(payload.cancelled_at),
    attendees: arrayValue(payload.attendees).map(meetingAttendeeFromPayload),
    reminders: arrayValue(payload.reminders).map(meetingReminderFromPayload),
  }
}

function meetingAttendeeFromPayload(value: unknown): MeetingAttendee {
  const payload = objectValue(value) as MeetingAttendeePayload

  return {
    id: stringValue(payload.id, ''),
    meetingId: stringValue(payload.meeting_id, ''),
    userId: nullableStringValue(payload.user_id),
    email: nullableStringValue(payload.email),
    displayName: nullableStringValue(payload.display_name),
    role: stringValue(payload.role, 'required'),
    responseStatus: stringValue(payload.response_status, 'needs_action'),
  }
}

function meetingReminderFromPayload(value: unknown): MeetingReminder {
  const payload = objectValue(value) as MeetingReminderPayload

  return {
    id: stringValue(payload.id, ''),
    meetingId: stringValue(payload.meeting_id, ''),
    recipientUserId: nullableStringValue(payload.recipient_user_id),
    recipientEmail: nullableStringValue(payload.recipient_email),
    channel: stringValue(payload.channel, 'in_app'),
    offsetMinutes: numberValue(payload.offset_minutes, 0),
    scheduledFor: stringValue(payload.scheduled_for, ''),
    status: stringValue(payload.status, 'pending'),
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

function authResultFromPayload(value: AuthResultPayload): AuthResult {
  return {
    user: authUserFromPayload(value.user),
    session: authSessionFromPayload(value.session),
  }
}

function authUserFromPayload(value: unknown): AuthUser {
  const payload = objectValue(value) as AuthUserPayload

  return {
    id: stringValue(payload.id, ''),
    email: stringValue(payload.email, ''),
    displayName: stringValue(payload.display_name, ''),
  }
}

function authSessionFromPayload(value: unknown): AuthSession {
  const payload = objectValue(value) as AuthSessionPayload

  return {
    token: stringValue(payload.token, ''),
  }
}

function oidcProviderFromPayload(value: unknown): OidcProvider {
  const payload = objectValue(value) as OidcProviderPayload

  return {
    organizationId: stringValue(payload.organization_id, ''),
    issuer: stringValue(payload.issuer, ''),
    authorizationEndpoint: stringValue(payload.authorization_endpoint, ''),
    tokenEndpoint: stringValue(payload.token_endpoint, ''),
    jwksUri: stringValue(payload.jwks_uri, ''),
    clientId: stringValue(payload.client_id, ''),
    allowedDomains: arrayValue(payload.allowed_domains).filter(
      (domain): domain is string => typeof domain === 'string',
    ),
    requireSso: booleanValue(payload.require_sso, false),
    autoJoinRole: stringValue(payload.auto_join_role, 'member'),
  }
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
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
