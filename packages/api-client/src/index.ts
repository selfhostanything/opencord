export type { components, operations, paths } from './generated/openapi'

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
  refreshToken: string
}

export type AuthResult = {
  user: AuthUser
  session: AuthSession
}

export type RegisterRequest = {
  email: string
  displayName: string
  password: string
}

export type LoginRequest = {
  email: string
  password: string
}

export type RefreshSessionRequest = {
  refreshToken: string
}

export type CreateOrganizationRequest = {
  name: string
}

export type Organization = {
  id: string
  name: string
  slug: string
  plan: string
  deploymentMode: string
  primaryRegion: string
  createdAt: string
  role: string | null
}

export type OrganizationMembership = {
  role: string
  status: string
}

export type OrganizationCreated = {
  organization: Organization
  membership: OrganizationMembership
}

export type CreateSpaceRequest = {
  name: string
}

export type Space = {
  id: string
  organizationId: string
  name: string
  slug: string
  createdAt: string
  role: string | null
}

export type SpaceCreated = {
  space: Space
  membership: OrganizationMembership
}

export type ChannelKind = 'text' | 'voice'

export type CreateChannelRequest = {
  name: string
  topic?: string
  kind?: ChannelKind
  isPrivate?: boolean
}

export type Channel = {
  id: string
  organizationId: string
  spaceId: string
  kind: ChannelKind
  name: string
  slug: string
  topic: string | null
  position: number
  isPrivate: boolean
  archivedAt: string | null
  createdAt: string
}

export type CreateMessageRequest = {
  content: string
  attachmentIds?: string[]
}

export type UpdateMessageRequest = {
  content: string
}

export type Message = {
  id: string
  organizationId: string
  spaceId: string | null
  channelId: string
  authorUserId: string
  content: string
  contentFormat: string
  embeds: Record<string, unknown>[]
  components: Record<string, unknown>[]
  webhookUsername: string | null
  webhookAvatarUrl: string | null
  replyToMessageId: string | null
  mentionUserIds: string[]
  mentionRoleIds: string[]
  mentionEveryone: boolean
  attachmentIds: string[]
  attachments: MessageAttachment[]
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
}

export type MessageAttachment = {
  id: string
  organizationId: string
  spaceId: string
  channelId: string
  messageId: string | null
  uploaderUserId: string
  fileName: string
  contentType: string
  sizeBytes: number
  status: string
  downloadUrl: string
}

export type CreateMeetingRequest = {
  spaceId?: string | null
  channelId?: string | null
  title: string
  description?: string | null
  startsAt: string
  endsAt: string
  timezone: string
  attendees?: Array<{
    userId?: string | null
    email?: string | null
    displayName?: string | null
    role?: string
  }>
  reminders?: Array<{
    recipientUserId?: string | null
    recipientEmail?: string | null
    channel: string
    offsetMinutes: number
  }>
}

export type CreateBotApplicationRequest = {
  name: string
  description?: string
}

export type BotApplication = {
  id: string
  organizationId: string
  botUserId: string
  createdByUserId: string
  name: string
  description: string | null
  status: string
}

export type BotToken = {
  id: string
  applicationId: string
  token: string
  tokenLastFour: string
}

export type BotApplicationCreated = {
  botApplication: BotApplication
  botToken: BotToken
}

export type BotApplicationDetail = {
  botApplication: BotApplication
  activeTokenLastFour: string | null
  spaceMemberships: SpaceMember[]
}

export type InviteBotToSpaceRequest = {
  role?: 'member' | 'guest'
}

export type SpaceMember = {
  spaceId: string
  userId: string
  role: string
  status: string
}

export type BotApplicationInvite = {
  botApplication: BotApplication
  member: SpaceMember
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

export type CreateMeetingMediaTokenRequest = {
  canPublishAudio?: boolean
  canPublishVideo?: boolean
  canPublishScreen?: boolean
  canSubscribe?: boolean
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
  spaceId: string | null
  channelId: string | null
  meetingId: string | null
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

export type CommandInteractionOption = Record<string, unknown>

export type CreateCommandInteractionRequest = {
  commandId: string
  options?: CommandInteractionOption[]
}

export type CommandInteraction = {
  id: string
  applicationId: string
  spaceId: string
  channelId: string
  commandId: string
  invokingUserId: string
  token: string
  tokenLastFour: string
  status: string
  options: CommandInteractionOption[]
  createdAt: string
  respondedAt: string | null
}

export type CreateIncomingWebhookRequest = {
  name: string
}

export type IncomingWebhook = {
  id: string
  organizationId: string
  spaceId: string
  channelId: string
  botUserId: string
  createdByUserId: string
  name: string
  status: string
  tokenLastFour: string
  createdAt: string
}

export type IncomingWebhookWithToken = IncomingWebhook & {
  token: string
  executeUrl: string
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
  refresh_token?: unknown
}

type AuthResultPayload = {
  user?: unknown
  session?: unknown
}

type OrganizationPayload = {
  id?: unknown
  name?: unknown
  slug?: unknown
  plan?: unknown
  deployment_mode?: unknown
  primary_region?: unknown
  created_at?: unknown
  role?: unknown
}

type OrganizationMembershipPayload = {
  role?: unknown
  status?: unknown
}

type OrganizationCreatedPayload = {
  organization?: unknown
  membership?: unknown
}

type OrganizationListPayload = {
  organizations?: unknown
}

type SpacePayload = {
  id?: unknown
  organization_id?: unknown
  name?: unknown
  slug?: unknown
  created_at?: unknown
  role?: unknown
}

type SpaceCreatedPayload = {
  space?: unknown
  membership?: unknown
}

type SpaceListPayload = {
  spaces?: unknown
}

type ChannelPayload = {
  id?: unknown
  organization_id?: unknown
  space_id?: unknown
  kind?: unknown
  name?: unknown
  slug?: unknown
  topic?: unknown
  position?: unknown
  is_private?: unknown
  archived_at?: unknown
  created_at?: unknown
}

type ChannelResourcePayload = {
  channel?: unknown
}

type ChannelListPayload = {
  channels?: unknown
}

type MessagePayload = {
  id?: unknown
  organization_id?: unknown
  space_id?: unknown
  channel_id?: unknown
  author_user_id?: unknown
  content?: unknown
  content_format?: unknown
  embeds?: unknown
  components?: unknown
  webhook_username?: unknown
  webhook_avatar_url?: unknown
  reply_to_message_id?: unknown
  mention_user_ids?: unknown
  mention_role_ids?: unknown
  mention_everyone?: unknown
  attachment_ids?: unknown
  attachments?: unknown
  created_at?: unknown
  edited_at?: unknown
  deleted_at?: unknown
}

type MessageAttachmentPayload = {
  id?: unknown
  organization_id?: unknown
  space_id?: unknown
  channel_id?: unknown
  message_id?: unknown
  uploader_user_id?: unknown
  file_name?: unknown
  content_type?: unknown
  size_bytes?: unknown
  status?: unknown
  download_url?: unknown
}

type MessageResourcePayload = {
  message?: unknown
}

type MessageListPayload = {
  messages?: unknown
}

type BotApplicationPayload = {
  id?: unknown
  organization_id?: unknown
  bot_user_id?: unknown
  created_by_user_id?: unknown
  name?: unknown
  description?: unknown
  status?: unknown
}

type BotTokenPayload = {
  id?: unknown
  application_id?: unknown
  token?: unknown
  token_last_four?: unknown
}

type BotApplicationCreatedPayload = {
  bot_application?: unknown
  bot_token?: unknown
}

type BotApplicationDetailPayload = {
  bot_application?: unknown
  active_token_last_four?: unknown
  space_memberships?: unknown
}

type BotApplicationListPayload = {
  bot_applications?: unknown
}

type BotTokenResourcePayload = {
  bot_token?: unknown
}

type SpaceMemberPayload = {
  space_id?: unknown
  user_id?: unknown
  role?: unknown
  status?: unknown
}

type BotApplicationInvitePayload = {
  bot_application?: unknown
  member?: unknown
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
  meeting_id?: unknown
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

type MediaRoomTokenResourcePayload = {
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

type CommandInteractionPayload = {
  id?: unknown
  application_id?: unknown
  space_id?: unknown
  channel_id?: unknown
  command_id?: unknown
  invoking_user_id?: unknown
  token?: unknown
  token_last_four?: unknown
  status?: unknown
  options?: unknown
  created_at?: unknown
  responded_at?: unknown
}

type CommandInteractionResourcePayload = {
  interaction?: unknown
}

type IncomingWebhookPayload = {
  id?: unknown
  organization_id?: unknown
  space_id?: unknown
  channel_id?: unknown
  bot_user_id?: unknown
  created_by_user_id?: unknown
  name?: unknown
  status?: unknown
  token_last_four?: unknown
  token?: unknown
  execute_url?: unknown
  created_at?: unknown
}

type IncomingWebhookResourcePayload = {
  webhook?: unknown
}

type IncomingWebhookListPayload = {
  webhooks?: unknown
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

  async register(request: RegisterRequest): Promise<AuthResult> {
    const payload = await this.requestJson<AuthResultPayload>('/auth/register', {
      body: JSON.stringify({
        email: request.email,
        display_name: request.displayName,
        password: request.password,
      }),
      method: 'POST',
    })

    return authResultFromPayload(payload)
  }

  async login(request: LoginRequest): Promise<AuthResult> {
    const payload = await this.requestJson<AuthResultPayload>('/auth/login', {
      body: JSON.stringify({
        email: request.email,
        password: request.password,
      }),
      method: 'POST',
    })

    return authResultFromPayload(payload)
  }

  async refreshSession(request: RefreshSessionRequest): Promise<AuthResult> {
    const payload = await this.requestJson<AuthResultPayload>('/auth/refresh', {
      body: JSON.stringify({
        refresh_token: request.refreshToken,
      }),
      method: 'POST',
    })

    return authResultFromPayload(payload)
  }

  async me(): Promise<AuthUser> {
    const payload = await this.requestJson<{ user?: unknown }>('/me')
    return authUserFromPayload(payload.user)
  }

  async createOrganization(request: CreateOrganizationRequest): Promise<OrganizationCreated> {
    const payload = await this.requestJson<OrganizationCreatedPayload>('/organizations', {
      body: JSON.stringify({
        name: request.name,
      }),
      method: 'POST',
    })

    return organizationCreatedFromPayload(payload)
  }

  async listOrganizations(): Promise<Organization[]> {
    const payload = await this.requestJson<OrganizationListPayload>('/organizations')
    return arrayValue(payload.organizations).map(organizationFromPayload)
  }

  async createSpace(organizationId: string, request: CreateSpaceRequest): Promise<SpaceCreated> {
    const payload = await this.requestJson<SpaceCreatedPayload>(
      `/organizations/${encodeURIComponent(organizationId)}/spaces`,
      {
        body: JSON.stringify({
          name: request.name,
        }),
        method: 'POST',
      },
    )

    return spaceCreatedFromPayload(payload)
  }

  async listSpaces(organizationId: string): Promise<Space[]> {
    const payload = await this.requestJson<SpaceListPayload>(
      `/organizations/${encodeURIComponent(organizationId)}/spaces`,
    )

    return arrayValue(payload.spaces).map(spaceFromPayload)
  }

  async createChannel(spaceId: string, request: CreateChannelRequest): Promise<Channel> {
    const payload = await this.requestJson<ChannelResourcePayload>(
      `/spaces/${encodeURIComponent(spaceId)}/channels`,
      {
        body: JSON.stringify({
          name: request.name,
          topic: request.topic,
          kind: request.kind,
          is_private: request.isPrivate,
        }),
        method: 'POST',
      },
    )

    return channelFromPayload(payload.channel)
  }

  async listChannels(spaceId: string): Promise<Channel[]> {
    const payload = await this.requestJson<ChannelListPayload>(
      `/spaces/${encodeURIComponent(spaceId)}/channels`,
    )

    return arrayValue(payload.channels).map(channelFromPayload)
  }

  async createMessage(channelId: string, request: CreateMessageRequest): Promise<Message> {
    const payload = await this.requestJson<MessageResourcePayload>(
      `/channels/${encodeURIComponent(channelId)}/messages`,
      {
        body: JSON.stringify({
          content: request.content,
          attachment_ids: request.attachmentIds ?? [],
        }),
        method: 'POST',
      },
    )

    return messageFromPayload(payload.message)
  }

  async listMessages(channelId: string): Promise<Message[]> {
    const payload = await this.requestJson<MessageListPayload>(
      `/channels/${encodeURIComponent(channelId)}/messages`,
    )

    return arrayValue(payload.messages).map(messageFromPayload)
  }

  async updateMessage(messageId: string, request: UpdateMessageRequest): Promise<Message> {
    const payload = await this.requestJson<MessageResourcePayload>(
      `/messages/${encodeURIComponent(messageId)}`,
      {
        body: JSON.stringify({
          content: request.content,
        }),
        method: 'PATCH',
      },
    )

    return messageFromPayload(payload.message)
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.requestJson<void>(`/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    })
  }

  async createMeeting(
    organizationId: string,
    request: CreateMeetingRequest,
  ): Promise<Meeting> {
    const payload = await this.requestJson<MeetingResourcePayload>(
      `/organizations/${encodeURIComponent(organizationId)}/meetings`,
      {
        body: JSON.stringify({
          space_id: request.spaceId,
          channel_id: request.channelId,
          title: request.title,
          description: request.description,
          starts_at: request.startsAt,
          ends_at: request.endsAt,
          timezone: request.timezone,
          attendees: request.attendees?.map((attendee) => ({
            user_id: attendee.userId,
            email: attendee.email,
            display_name: attendee.displayName,
            role: attendee.role ?? 'required',
          })),
          reminders: request.reminders?.map((reminder) => ({
            recipient_user_id: reminder.recipientUserId,
            recipient_email: reminder.recipientEmail,
            channel: reminder.channel,
            offset_minutes: reminder.offsetMinutes,
          })),
        }),
        method: 'POST',
      },
    )

    return meetingFromPayload(payload.meeting)
  }

  async listMeetings(organizationId: string): Promise<Meeting[]> {
    const payload = await this.requestJson<{ meetings?: unknown }>(
      `/organizations/${encodeURIComponent(organizationId)}/meetings`,
    )

    return arrayValue(payload.meetings).map(meetingFromPayload)
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

  async createMeetingMediaToken(
    meetingId: string,
    request: CreateMeetingMediaTokenRequest = {},
  ): Promise<MediaRoomToken> {
    const payload = await this.requestJson<MediaRoomTokenResourcePayload>(
      `/meetings/${encodeURIComponent(meetingId)}/media/token`,
      {
        body: JSON.stringify({
          can_publish_audio: request.canPublishAudio,
          can_publish_video: request.canPublishVideo,
          can_publish_screen: request.canPublishScreen,
          can_subscribe: request.canSubscribe,
        }),
        method: 'POST',
      },
    )

    return mediaRoomTokenFromPayload(payload.media)
  }

  async createCommandInteraction(
    channelId: string,
    request: CreateCommandInteractionRequest,
  ): Promise<CommandInteraction> {
    const payload = await this.requestJson<CommandInteractionResourcePayload>(
      `/channels/${encodeURIComponent(channelId)}/command-interactions`,
      {
        body: JSON.stringify({
          command_id: request.commandId,
          options: request.options ?? [],
        }),
        method: 'POST',
      },
    )

    return commandInteractionFromPayload(payload.interaction)
  }

  async createIncomingWebhook(
    channelId: string,
    request: CreateIncomingWebhookRequest,
  ): Promise<IncomingWebhookWithToken> {
    const payload = await this.requestJson<IncomingWebhookResourcePayload>(
      `/channels/${encodeURIComponent(channelId)}/webhooks`,
      {
        body: JSON.stringify({
          name: request.name,
        }),
        method: 'POST',
      },
    )

    return incomingWebhookWithTokenFromPayload(payload.webhook)
  }

  async listIncomingWebhooks(channelId: string): Promise<IncomingWebhook[]> {
    const payload = await this.requestJson<IncomingWebhookListPayload>(
      `/channels/${encodeURIComponent(channelId)}/webhooks`,
    )

    return arrayValue(payload.webhooks).map(incomingWebhookFromPayload)
  }

  async rotateIncomingWebhookToken(
    channelId: string,
    webhookId: string,
  ): Promise<IncomingWebhookWithToken> {
    const payload = await this.requestJson<IncomingWebhookResourcePayload>(
      `/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(
        webhookId,
      )}/token/rotate`,
      {
        method: 'POST',
      },
    )

    return incomingWebhookWithTokenFromPayload(payload.webhook)
  }

  async deleteIncomingWebhook(channelId: string, webhookId: string): Promise<void> {
    await this.requestJson<void>(
      `/channels/${encodeURIComponent(channelId)}/webhooks/${encodeURIComponent(webhookId)}`,
      {
        method: 'DELETE',
      },
    )
  }

  async createBotApplication(
    organizationId: string,
    request: CreateBotApplicationRequest,
  ): Promise<BotApplicationCreated> {
    const payload = await this.requestJson<BotApplicationCreatedPayload>(
      `/organizations/${encodeURIComponent(organizationId)}/bot-applications`,
      {
        body: JSON.stringify({
          name: request.name,
          description: request.description,
        }),
        method: 'POST',
      },
    )

    return botApplicationCreatedFromPayload(payload)
  }

  async listBotApplications(organizationId: string): Promise<BotApplicationDetail[]> {
    const payload = await this.requestJson<BotApplicationListPayload>(
      `/organizations/${encodeURIComponent(organizationId)}/bot-applications`,
    )

    return arrayValue(payload.bot_applications).map(botApplicationDetailFromPayload)
  }

  async getBotApplication(
    organizationId: string,
    applicationId: string,
  ): Promise<BotApplicationDetail> {
    const payload = await this.requestJson<BotApplicationDetailPayload>(
      `/organizations/${encodeURIComponent(
        organizationId,
      )}/bot-applications/${encodeURIComponent(applicationId)}`,
    )

    return botApplicationDetailFromPayload(payload)
  }

  async rotateBotToken(organizationId: string, applicationId: string): Promise<BotToken> {
    const payload = await this.requestJson<BotTokenResourcePayload>(
      `/organizations/${encodeURIComponent(
        organizationId,
      )}/bot-applications/${encodeURIComponent(applicationId)}/tokens/rotate`,
      {
        method: 'POST',
      },
    )

    return botTokenFromPayload(payload.bot_token)
  }

  async inviteBotApplicationToSpace(
    organizationId: string,
    applicationId: string,
    spaceId: string,
    request: InviteBotToSpaceRequest = {},
  ): Promise<BotApplicationInvite> {
    const payload = await this.requestJson<BotApplicationInvitePayload>(
      `/organizations/${encodeURIComponent(
        organizationId,
      )}/bot-applications/${encodeURIComponent(applicationId)}/spaces/${encodeURIComponent(
        spaceId,
      )}/invite`,
      {
        body: JSON.stringify({
          role: request.role ?? 'member',
        }),
        method: 'POST',
      },
    )

    return botApplicationInviteFromPayload(payload)
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

function channelKindValue(value: unknown): ChannelKind {
  return value === 'voice' ? 'voice' : 'text'
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
    spaceId: nullableStringValue(payload.space_id),
    channelId: nullableStringValue(payload.channel_id),
    meetingId: nullableStringValue(payload.meeting_id),
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

function commandInteractionFromPayload(value: unknown): CommandInteraction {
  const payload = objectValue(value) as CommandInteractionPayload

  return {
    id: stringValue(payload.id, ''),
    applicationId: stringValue(payload.application_id, ''),
    spaceId: stringValue(payload.space_id, ''),
    channelId: stringValue(payload.channel_id, ''),
    commandId: stringValue(payload.command_id, ''),
    invokingUserId: stringValue(payload.invoking_user_id, ''),
    token: stringValue(payload.token, ''),
    tokenLastFour: stringValue(payload.token_last_four, ''),
    status: stringValue(payload.status, 'pending'),
    options: arrayValue(payload.options).map(objectValue),
    createdAt: stringValue(payload.created_at, ''),
    respondedAt: nullableStringValue(payload.responded_at),
  }
}

function incomingWebhookFromPayload(value: unknown): IncomingWebhook {
  const payload = objectValue(value) as IncomingWebhookPayload

  return {
    id: stringValue(payload.id, ''),
    organizationId: stringValue(payload.organization_id, ''),
    spaceId: stringValue(payload.space_id, ''),
    channelId: stringValue(payload.channel_id, ''),
    botUserId: stringValue(payload.bot_user_id, ''),
    createdByUserId: stringValue(payload.created_by_user_id, ''),
    name: stringValue(payload.name, ''),
    status: stringValue(payload.status, 'active'),
    tokenLastFour: stringValue(payload.token_last_four, ''),
    createdAt: stringValue(payload.created_at, ''),
  }
}

function incomingWebhookWithTokenFromPayload(value: unknown): IncomingWebhookWithToken {
  const payload = objectValue(value) as IncomingWebhookPayload

  return {
    ...incomingWebhookFromPayload(payload),
    token: stringValue(payload.token, ''),
    executeUrl: stringValue(payload.execute_url, ''),
  }
}

function botApplicationCreatedFromPayload(value: BotApplicationCreatedPayload): BotApplicationCreated {
  return {
    botApplication: botApplicationFromPayload(value.bot_application),
    botToken: botTokenFromPayload(value.bot_token),
  }
}

function botApplicationDetailFromPayload(value: unknown): BotApplicationDetail {
  const payload = objectValue(value) as BotApplicationDetailPayload

  return {
    botApplication: botApplicationFromPayload(payload.bot_application),
    activeTokenLastFour: nullableStringValue(payload.active_token_last_four),
    spaceMemberships: arrayValue(payload.space_memberships).map(spaceMemberFromPayload),
  }
}

function botApplicationInviteFromPayload(value: BotApplicationInvitePayload): BotApplicationInvite {
  return {
    botApplication: botApplicationFromPayload(value.bot_application),
    member: spaceMemberFromPayload(value.member),
  }
}

function botApplicationFromPayload(value: unknown): BotApplication {
  const payload = objectValue(value) as BotApplicationPayload

  return {
    id: stringValue(payload.id, ''),
    organizationId: stringValue(payload.organization_id, ''),
    botUserId: stringValue(payload.bot_user_id, ''),
    createdByUserId: stringValue(payload.created_by_user_id, ''),
    name: stringValue(payload.name, ''),
    description: nullableStringValue(payload.description),
    status: stringValue(payload.status, 'active'),
  }
}

function botTokenFromPayload(value: unknown): BotToken {
  const payload = objectValue(value) as BotTokenPayload

  return {
    id: stringValue(payload.id, ''),
    applicationId: stringValue(payload.application_id, ''),
    token: stringValue(payload.token, ''),
    tokenLastFour: stringValue(payload.token_last_four, ''),
  }
}

function spaceMemberFromPayload(value: unknown): SpaceMember {
  const payload = objectValue(value) as SpaceMemberPayload

  return {
    spaceId: stringValue(payload.space_id, ''),
    userId: stringValue(payload.user_id, ''),
    role: stringValue(payload.role, 'member'),
    status: stringValue(payload.status, 'active'),
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

function organizationCreatedFromPayload(value: OrganizationCreatedPayload): OrganizationCreated {
  return {
    organization: organizationFromPayload(value.organization),
    membership: organizationMembershipFromPayload(value.membership),
  }
}

function organizationFromPayload(value: unknown): Organization {
  const payload = objectValue(value) as OrganizationPayload

  return {
    id: stringValue(payload.id, ''),
    name: stringValue(payload.name, ''),
    slug: stringValue(payload.slug, ''),
    plan: stringValue(payload.plan, 'free'),
    deploymentMode: stringValue(payload.deployment_mode, 'self_hosted'),
    primaryRegion: stringValue(payload.primary_region, 'local'),
    createdAt: stringValue(payload.created_at, ''),
    role: nullableStringValue(payload.role),
  }
}

function organizationMembershipFromPayload(value: unknown): OrganizationMembership {
  const payload = objectValue(value) as OrganizationMembershipPayload

  return {
    role: stringValue(payload.role, 'member'),
    status: stringValue(payload.status, 'active'),
  }
}

function spaceCreatedFromPayload(value: SpaceCreatedPayload): SpaceCreated {
  return {
    space: spaceFromPayload(value.space),
    membership: organizationMembershipFromPayload(value.membership),
  }
}

function spaceFromPayload(value: unknown): Space {
  const payload = objectValue(value) as SpacePayload

  return {
    id: stringValue(payload.id, ''),
    organizationId: stringValue(payload.organization_id, ''),
    name: stringValue(payload.name, ''),
    slug: stringValue(payload.slug, ''),
    createdAt: stringValue(payload.created_at, ''),
    role: nullableStringValue(payload.role),
  }
}

function channelFromPayload(value: unknown): Channel {
  const payload = objectValue(value) as ChannelPayload

  return {
    id: stringValue(payload.id, ''),
    organizationId: stringValue(payload.organization_id, ''),
    spaceId: stringValue(payload.space_id, ''),
    kind: channelKindValue(payload.kind),
    name: stringValue(payload.name, ''),
    slug: stringValue(payload.slug, ''),
    topic: nullableStringValue(payload.topic),
    position: numberValue(payload.position, 0),
    isPrivate: booleanValue(payload.is_private, false),
    archivedAt: nullableStringValue(payload.archived_at),
    createdAt: stringValue(payload.created_at, ''),
  }
}

function messageFromPayload(value: unknown): Message {
  const payload = objectValue(value) as MessagePayload
  const attachments = arrayValue(payload.attachments).map(messageAttachmentFromPayload)

  return {
    id: stringValue(payload.id, ''),
    organizationId: stringValue(payload.organization_id, ''),
    spaceId: nullableStringValue(payload.space_id),
    channelId: stringValue(payload.channel_id, ''),
    authorUserId: stringValue(payload.author_user_id, ''),
    content: stringValue(payload.content, ''),
    contentFormat: stringValue(payload.content_format, 'plain'),
    embeds: objectArrayValue(payload.embeds),
    components: objectArrayValue(payload.components),
    webhookUsername: nullableStringValue(payload.webhook_username),
    webhookAvatarUrl: nullableStringValue(payload.webhook_avatar_url),
    replyToMessageId: nullableStringValue(payload.reply_to_message_id),
    mentionUserIds: stringArrayValue(payload.mention_user_ids),
    mentionRoleIds: stringArrayValue(payload.mention_role_ids),
    mentionEveryone: booleanValue(payload.mention_everyone, false),
    attachmentIds: Array.from(
      new Set([
        ...stringArrayValue(payload.attachment_ids),
        ...attachments.map((attachment) => attachment.id),
      ]),
    ),
    attachments,
    createdAt: stringValue(payload.created_at, ''),
    editedAt: nullableStringValue(payload.edited_at),
    deletedAt: nullableStringValue(payload.deleted_at),
  }
}

function messageAttachmentFromPayload(value: unknown): MessageAttachment {
  const payload = objectValue(value) as MessageAttachmentPayload

  return {
    id: stringValue(payload.id, ''),
    organizationId: stringValue(payload.organization_id, ''),
    spaceId: stringValue(payload.space_id, ''),
    channelId: stringValue(payload.channel_id, ''),
    messageId: nullableStringValue(payload.message_id),
    uploaderUserId: stringValue(payload.uploader_user_id, ''),
    fileName: stringValue(payload.file_name, ''),
    contentType: stringValue(payload.content_type, 'application/octet-stream'),
    sizeBytes: numberValue(payload.size_bytes, 0),
    status: stringValue(payload.status, ''),
    downloadUrl: stringValue(payload.download_url, ''),
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
    refreshToken: stringValue(payload.refresh_token, ''),
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

function stringArrayValue(value: unknown): string[] {
  return arrayValue(value).filter((item): item is string => typeof item === 'string')
}

function objectArrayValue(value: unknown): Record<string, unknown>[] {
  return arrayValue(value).filter(
    (item): item is Record<string, unknown> => typeof item === 'object' && item !== null,
  )
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
