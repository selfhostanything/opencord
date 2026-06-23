import {
  DEFAULT_OPENCORD_SERVER_URL,
  normalizeOpenCordBaseUrl,
  type PushPlatform,
  type PushToken,
  type RegisterPushTokenRequest,
} from '@opencord/api-client'
import {
  INITIAL_REALTIME_STATUS,
  type RealtimeConnectionStatus,
  type RealtimeIncomingEnvelope,
} from '@opencord/realtime'
import {
  activeServerConnection,
  createDefaultServerConnectionState,
  removeServerConnection,
  switchServerConnection,
  upsertServerConnection,
  type ServerConnectionState,
} from '@opencord/server-connections'

export type MobileScreen = 'login' | 'channels' | 'chat'

export type MobileAccount = {
  email: string
  displayName: string
}

export type MobileChannel = {
  id: string
  kind: 'text' | 'voice'
  name: string
  topic: string
  unread: boolean
}

export type MobileMessage = {
  id: string
  channelId: string
  authorName: string
  content: string
  embeds: MobileRichEmbed[]
  time: string
  own: boolean
}

export type MobileRichEmbed = {
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
  fields?: MobileRichEmbedField[]
}

export type MobileRichEmbedField = {
  name: string
  value: string
  inline?: boolean
}

export type MobileVoiceParticipant = {
  id: string
  channelId: string
  name: string
  status: 'connected' | 'speaking' | 'muted' | 'deafened'
  self?: boolean
}

export type MobileVoiceState = {
  connectedChannelId: string | null
  selfMute: boolean
  selfDeaf: boolean
  participants: MobileVoiceParticipant[]
}

export type MobilePushRegistration =
  | { status: 'idle' }
  | {
      status: 'registered'
      platform: PushPlatform
      tokenLastFour: string
      deviceName: string | null
    }
  | { status: 'failed'; message: string }

export type MobileAppState = {
  screen: MobileScreen
  serverUrl: string
  serverConnections: ServerConnectionState
  account: MobileAccount | null
  channels: MobileChannel[]
  selectedChannelId: string
  messages: MobileMessage[]
  realtimeStatus: RealtimeConnectionStatus
  pushRegistration: MobilePushRegistration
  voice: MobileVoiceState
}

export type MobileAction =
  | { type: 'login.submit'; serverUrl: string; email: string }
  | { type: 'logout' }
  | { type: 'channel.select'; channelId: string }
  | { type: 'channel.back' }
  | { type: 'message.send'; content: string }
  | { type: 'realtime.message_created'; envelope: RealtimeIncomingEnvelope }
  | { type: 'voice.join'; channelId: string }
  | { type: 'voice.leave' }
  | { type: 'voice.toggle_mute' }
  | { type: 'voice.toggle_deaf' }
  | { type: 'push.registered'; pushToken: PushToken }
  | { type: 'push.failed'; message: string }
  | {
      type: 'server.add'
      baseUrl: string
      displayName?: string
      serverVersion?: string
      capabilities?: string[]
      now?: string
    }
  | { type: 'server.switch'; connectionId: string }
  | { type: 'server.remove'; connectionId: string }

const initialChannels: MobileChannel[] = [
  {
    id: 'general',
    kind: 'text',
    name: 'general',
    topic: 'Company-wide chat and daily updates.',
    unread: true,
  },
  {
    id: 'backend',
    kind: 'text',
    name: 'backend',
    topic: 'API, realtime, permissions, and deployment work.',
    unread: false,
  },
  {
    id: 'announcements',
    kind: 'text',
    name: 'announcements',
    topic: 'Read-only release notes and notices.',
    unread: false,
  },
  {
    id: 'standup',
    kind: 'voice',
    name: 'standup',
    topic: 'Daily mobile voice check-in.',
    unread: false,
  },
  {
    id: 'office-hours',
    kind: 'voice',
    name: 'office-hours',
    topic: 'Drop-in support voice room.',
    unread: false,
  },
]

const initialMessages: MobileMessage[] = [
  {
    id: 'seed-1',
    channelId: 'general',
    authorName: 'Mira',
    content: 'Mobile shell is ready for login, channel navigation, and chat state.',
    embeds: [
      {
        type: 'rich',
        title: 'Deploy preview ready',
        description: 'Webhook embed payloads now render in official clients.',
        color: 2644333,
        fields: [
          { name: 'Environment', value: 'production', inline: true },
          { name: 'Version', value: '2026.06.24', inline: true },
        ],
        footer: { text: 'Release Hook' },
      },
    ],
    time: '09:10',
    own: false,
  },
  {
    id: 'seed-2',
    channelId: 'backend',
    authorName: 'Thanet',
    content: 'Shared API and realtime packages are available to mobile now.',
    embeds: [],
    time: '09:16',
    own: false,
  },
]

const initialVoiceState: MobileVoiceState = {
  connectedChannelId: null,
  selfMute: false,
  selfDeaf: false,
  participants: [
    { id: 'voice-u1', channelId: 'standup', name: 'Mira', status: 'speaking' },
    { id: 'voice-u2', channelId: 'office-hours', name: 'Thanet', status: 'connected' },
  ],
}

export function createInitialMobileState(): MobileAppState {
  const serverConnections = createDefaultServerConnectionState()
  const activeConnection = activeServerConnection(serverConnections)

  return {
    screen: 'login',
    serverUrl: activeConnection?.baseUrl ?? DEFAULT_OPENCORD_SERVER_URL,
    serverConnections,
    account: null,
    channels: initialChannels,
    selectedChannelId: initialChannels[0].id,
    messages: initialMessages,
    realtimeStatus: INITIAL_REALTIME_STATUS,
    pushRegistration: { status: 'idle' },
    voice: initialVoiceState,
  }
}

export function mobileReducer(state: MobileAppState, action: MobileAction): MobileAppState {
  switch (action.type) {
    case 'login.submit': {
      const email = action.email.trim()
      if (!email) {
        return state
      }
      const serverConnections = upsertServerConnection(state.serverConnections, {
        baseUrl: action.serverUrl,
      })
      const activeConnection = activeServerConnection(serverConnections)

      return {
        ...state,
        screen: 'channels',
        serverUrl: activeConnection?.baseUrl ?? normalizeOpenCordBaseUrl(action.serverUrl),
        serverConnections,
        account: {
          email,
          displayName: displayNameForEmail(email),
        },
      }
    }
    case 'logout':
      return createInitialMobileState()
    case 'channel.select': {
      if (!state.channels.some((channel) => channel.id === action.channelId)) {
        return state
      }

      return {
        ...state,
        screen: 'chat',
        selectedChannelId: action.channelId,
        channels: state.channels.map((channel) =>
          channel.id === action.channelId ? { ...channel, unread: false } : channel,
        ),
      }
    }
    case 'channel.back':
      return {
        ...state,
        screen: 'channels',
      }
    case 'message.send': {
      const content = action.content.trim()
      if (!content) {
        return state
      }

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: `local-${Date.now()}`,
            channelId: state.selectedChannelId,
            authorName: 'You',
            content,
            embeds: [],
            time: 'now',
            own: true,
          },
        ],
      }
    }
    case 'realtime.message_created': {
      const message = messageFromRealtimeEnvelope(action.envelope)
      if (!message) {
        return state
      }

      const isOpenChannel = state.screen === 'chat' && state.selectedChannelId === message.channelId

      return {
        ...state,
        messages: [...state.messages, message],
        channels: state.channels.map((channel) =>
          channel.id === message.channelId ? { ...channel, unread: !isOpenChannel } : channel,
        ),
      }
    }
    case 'voice.join': {
      const channel = state.channels.find((candidate) => candidate.id === action.channelId)
      if (channel?.kind !== 'voice') {
        return state
      }

      return {
        ...state,
        voice: {
          ...state.voice,
          connectedChannelId: channel.id,
          participants: [
            ...state.voice.participants.filter((participant) => !participant.self),
            {
              id: 'voice-self',
              channelId: channel.id,
              name: 'You',
              status: mobileSelfVoiceStatus({
                selfDeaf: state.voice.selfDeaf,
                selfMute: state.voice.selfMute,
              }),
              self: true,
            },
          ],
        },
      }
    }
    case 'voice.leave':
      return {
        ...state,
        voice: {
          ...state.voice,
          connectedChannelId: null,
          selfMute: false,
          selfDeaf: false,
          participants: state.voice.participants.filter((participant) => !participant.self),
        },
      }
    case 'voice.toggle_mute': {
      if (!state.voice.connectedChannelId) {
        return state
      }
      const selfMute = !state.voice.selfMute

      return {
        ...state,
        voice: {
          ...state.voice,
          selfMute,
          participants: updateMobileSelfVoiceStatus(state.voice, {
            selfDeaf: state.voice.selfDeaf,
            selfMute,
          }),
        },
      }
    }
    case 'voice.toggle_deaf': {
      if (!state.voice.connectedChannelId) {
        return state
      }
      const selfDeaf = !state.voice.selfDeaf
      const selfMute = selfDeaf ? true : state.voice.selfMute

      return {
        ...state,
        voice: {
          ...state.voice,
          selfDeaf,
          selfMute,
          participants: updateMobileSelfVoiceStatus(state.voice, {
            selfDeaf,
            selfMute,
          }),
        },
      }
    }
    case 'push.registered':
      return {
        ...state,
        pushRegistration: {
          status: 'registered',
          platform: action.pushToken.platform,
          tokenLastFour: action.pushToken.tokenLastFour,
          deviceName: action.pushToken.deviceName,
        },
      }
    case 'push.failed':
      return {
        ...state,
        pushRegistration: {
          status: 'failed',
          message: action.message,
        },
      }
    case 'server.add': {
      const serverConnections = upsertServerConnection(state.serverConnections, {
        baseUrl: action.baseUrl,
        displayName: action.displayName,
        serverVersion: action.serverVersion,
        capabilities: action.capabilities,
        now: action.now,
      })
      const activeConnection = activeServerConnection(serverConnections)

      return {
        ...state,
        serverUrl: activeConnection?.baseUrl ?? state.serverUrl,
        serverConnections,
      }
    }
    case 'server.switch': {
      const serverConnections = switchServerConnection(
        state.serverConnections,
        action.connectionId,
      )
      const activeConnection = activeServerConnection(serverConnections)

      return {
        ...state,
        serverUrl: activeConnection?.baseUrl ?? state.serverUrl,
        serverConnections,
      }
    }
    case 'server.remove': {
      const serverConnections = removeServerConnection(
        state.serverConnections,
        action.connectionId,
      )
      const activeConnection = activeServerConnection(serverConnections)

      return {
        ...state,
        serverUrl: activeConnection?.baseUrl ?? DEFAULT_OPENCORD_SERVER_URL,
        serverConnections,
      }
    }
  }
}

export function mobilePushTokenRequest(
  token: string,
  platform: PushPlatform,
  deviceName?: string,
): RegisterPushTokenRequest {
  return {
    platform,
    token,
    deviceName,
  }
}

export function messagesForChannel(state: MobileAppState, channelId = state.selectedChannelId) {
  return state.messages.filter((message) => message.channelId === channelId)
}

export function mobileVoiceParticipantsForChannel(
  state: MobileAppState,
  channelId = state.voice.connectedChannelId,
) {
  if (!channelId) {
    return []
  }

  return state.voice.participants.filter((participant) => {
    if (!participant.self) {
      return participant.channelId === channelId
    }

    return state.voice.connectedChannelId === channelId && participant.channelId === channelId
  })
}

export function mobileCanListenToVoice(state: MobileAppState) {
  return Boolean(state.voice.connectedChannelId && !state.voice.selfDeaf)
}

export function mobileCanSpeakInVoice(state: MobileAppState) {
  return Boolean(state.voice.connectedChannelId && !state.voice.selfMute && !state.voice.selfDeaf)
}

export function selectedChannel(state: MobileAppState) {
  return (
    state.channels.find((channel) => channel.id === state.selectedChannelId) ?? state.channels[0]
  )
}

export function activeMobileServerConnection(state: MobileAppState) {
  return activeServerConnection(state.serverConnections)
}

function displayNameForEmail(email: string) {
  return email.split('@')[0] || 'OpenCord user'
}

function updateMobileSelfVoiceStatus(
  voice: MobileVoiceState,
  {
    selfDeaf,
    selfMute,
  }: {
    selfDeaf: boolean
    selfMute: boolean
  },
): MobileVoiceParticipant[] {
  return voice.participants.map((participant) =>
    participant.self
      ? {
          ...participant,
          status: mobileSelfVoiceStatus({ selfDeaf, selfMute }),
        }
      : participant,
  )
}

function mobileSelfVoiceStatus({
  selfDeaf,
  selfMute,
}: {
  selfDeaf: boolean
  selfMute: boolean
}): MobileVoiceParticipant['status'] {
  if (selfDeaf) {
    return 'deafened'
  }

  if (selfMute) {
    return 'muted'
  }

  return 'connected'
}

function messageFromRealtimeEnvelope(envelope: RealtimeIncomingEnvelope): MobileMessage | null {
  if (envelope.type !== 'message.created' || !('data' in envelope)) {
    return null
  }

  const data = objectValue(envelope.data)
  const message = objectValue(data.message)
  const channelId = stringValue(message.channel_id) ?? envelope.scope.channel_id
  const content = textValue(message.content)
  const embeds = richEmbedsValue(message.embeds)
  if (!channelId || (!content && embeds.length === 0)) {
    return null
  }

  return {
    id: stringValue(message.id) ?? envelope.id,
    channelId,
    authorName:
      stringValue(message.author_display_name) ??
      stringValue(message.author_user_id) ??
      'Unknown user',
    content,
    embeds,
    time: timeLabel(envelope.occurred_at),
    own: false,
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}

function richEmbedsValue(value: unknown): MobileRichEmbed[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((candidate) => {
    const embed = richEmbedValue(candidate)
    return embed ? [embed] : []
  })
}

function richEmbedValue(value: unknown): MobileRichEmbed | null {
  const embed = objectValue(value)
  const fields = richEmbedFieldsValue(embed.fields)
  const footer = richEmbedFooterValue(embed.footer)
  const author = richEmbedAuthorValue(embed.author)
  const title = stringValue(embed.title)
  const description = stringValue(embed.description)
  const url = stringValue(embed.url)
  const timestamp = stringValue(embed.timestamp)
  const color = numberValue(embed.color)

  if (!title && !description && fields.length === 0 && !footer && !author) {
    return null
  }

  return {
    type: 'rich',
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
    ...(timestamp ? { timestamp } : {}),
    ...(color !== undefined ? { color } : {}),
    ...(author ? { author } : {}),
    ...(footer ? { footer } : {}),
    ...(fields.length > 0 ? { fields } : {}),
  }
}

function richEmbedFieldsValue(value: unknown): MobileRichEmbedField[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((candidate) => {
    const field = objectValue(candidate)
    const name = stringValue(field.name)
    const fieldValue = stringValue(field.value)
    if (!name || !fieldValue) {
      return []
    }
    const inline = booleanValue(field.inline)

    return [
      {
        name,
        value: fieldValue,
        ...(inline !== undefined ? { inline } : {}),
      },
    ]
  })
}

function richEmbedFooterValue(value: unknown): MobileRichEmbed['footer'] | undefined {
  const footer = objectValue(value)
  const text = stringValue(footer.text)
  if (!text) {
    return undefined
  }
  const iconUrl = stringValue(footer.icon_url)

  return {
    text,
    ...(iconUrl ? { iconUrl } : {}),
  }
}

function richEmbedAuthorValue(value: unknown): MobileRichEmbed['author'] | undefined {
  const author = objectValue(value)
  const name = stringValue(author.name)
  if (!name) {
    return undefined
  }
  const url = stringValue(author.url)
  const iconUrl = stringValue(author.icon_url)

  return {
    name,
    ...(url ? { url } : {}),
    ...(iconUrl ? { iconUrl } : {}),
  }
}

function timeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'now'
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
