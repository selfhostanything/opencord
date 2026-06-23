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
  name: string
  topic: string
  unread: boolean
}

export type MobileMessage = {
  id: string
  channelId: string
  authorName: string
  content: string
  time: string
  own: boolean
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
}

export type MobileAction =
  | { type: 'login.submit'; serverUrl: string; email: string }
  | { type: 'logout' }
  | { type: 'channel.select'; channelId: string }
  | { type: 'channel.back' }
  | { type: 'message.send'; content: string }
  | { type: 'realtime.message_created'; envelope: RealtimeIncomingEnvelope }
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
    name: 'general',
    topic: 'Company-wide chat and daily updates.',
    unread: true,
  },
  {
    id: 'backend',
    name: 'backend',
    topic: 'API, realtime, permissions, and deployment work.',
    unread: false,
  },
  {
    id: 'announcements',
    name: 'announcements',
    topic: 'Read-only release notes and notices.',
    unread: false,
  },
]

const initialMessages: MobileMessage[] = [
  {
    id: 'seed-1',
    channelId: 'general',
    authorName: 'Mira',
    content: 'Mobile shell is ready for login, channel navigation, and chat state.',
    time: '09:10',
    own: false,
  },
  {
    id: 'seed-2',
    channelId: 'backend',
    authorName: 'Thanet',
    content: 'Shared API and realtime packages are available to mobile now.',
    time: '09:16',
    own: false,
  },
]

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

function messageFromRealtimeEnvelope(envelope: RealtimeIncomingEnvelope): MobileMessage | null {
  if (envelope.type !== 'message.created' || !('data' in envelope)) {
    return null
  }

  const data = objectValue(envelope.data)
  const message = objectValue(data.message)
  const channelId = stringValue(message.channel_id) ?? envelope.scope.channel_id
  const content = stringValue(message.content)
  if (!channelId || !content) {
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

function timeLabel(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'now'
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
