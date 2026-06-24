import {
  normalizeOpenCordBaseUrl,
  type Channel,
  type PushPlatform,
  type PushToken,
  type RegisterPushTokenRequest,
} from '@opencord/api-client'
import type { OpenCordRouteTarget } from '@opencord/client-contracts'
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
  type ServerConnection,
  type ServerConnectionState,
} from '@opencord/server-connections'

import type { NativeScreenShareStream } from './nativeScreenShareStreams'

export type MobileScreen = 'login' | 'channels' | 'chat'

export const DEFAULT_MOBILE_OPENCORD_SERVER_URL = 'http://10.0.2.2:8080'
export const IOS_SIMULATOR_MOBILE_OPENCORD_SERVER_URL = 'http://localhost:8080'
export const DEFAULT_MOBILE_ORGANIZATION_ID = 'local'
export const DEFAULT_MOBILE_SPACE_ID = 'main'
export const DEFAULT_MOBILE_SPACE_NAME = 'OpenCord HQ'

export function mobileDefaultOpenCordServerUrlForPlatform(platform: string) {
  return platform === 'ios'
    ? IOS_SIMULATOR_MOBILE_OPENCORD_SERVER_URL
    : DEFAULT_MOBILE_OPENCORD_SERVER_URL
}

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
  category?: string
  mentionCount?: number
  organizationId?: string
  spaceId?: string
  spaceName?: string
  voiceOccupancy?: number
}

export type MobileWorkspaceChannelRow = {
  id: string
  kind: 'text' | 'voice'
  name: string
  topic: string
  connected: boolean
  mentionCount: number
  selected: boolean
  unread: boolean
  voiceOccupancy: number
}

export type MobileWorkspaceNavigatorSection = {
  id: string
  title: string
  spaceId: string
  channels: MobileWorkspaceChannelRow[]
}

export type MobileMessage = {
  id: string
  channelId: string
  authorName: string
  authorKind: MobileMessageAuthorKind
  authorBadge?: string
  avatarUrl?: string
  content: string
  attachments: MobileMessageAttachment[]
  components: MobileMessageComponent[]
  embeds: MobileRichEmbed[]
  time: string
  own: boolean
  deleted?: boolean
  deliveryError?: string | null
  deliveryStatus?: 'sending' | 'sent' | 'failed'
  edited?: boolean
  editedAt?: string
  mentions?: MobileMentionToken[]
  pinned?: boolean
  reactions?: MobileMessageReaction[]
  replyToMessageId?: string
}

export type MobileMessageAuthorKind = 'user' | 'bot' | 'webhook' | 'system'

export type MobileMessageAttachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  status: string
  downloadUrl: string
}

export type MobileMessageComponent = {
  id: string
  label: string
  disabled: boolean
}

export type MobileMessageReaction = {
  emoji: string
  count: number
  selfReacted: boolean
}

export type MobileMentionToken = {
  display: string
  query: string
  start: number
  end: number
}

export type MobileMessageTimelineGroup = {
  id: string
  authorName: string
  authorKind: MobileMessageAuthorKind
  authorBadge?: string
  avatarUrl?: string
  own: boolean
  messages: MobileMessage[]
}

export type MobileMessageActionId =
  | 'reply'
  | 'edit'
  | 'delete'
  | 'copy'
  | 'pin'
  | 'react'
  | 'report'

export type MobileMessageActionOption = {
  id: MobileMessageActionId
  label: string
  destructive?: boolean
}

export type MobileComposerUiState = {
  canSend: boolean
  disabledReason: string | null
  mode: 'send' | 'reply' | 'edit'
  placeholder: string
  pendingAttachmentCount: number
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

export type MobileMediaPermissionKind =
  | 'microphone'
  | 'camera'
  | 'screenShare'
  | 'speaker'
  | 'notifications'
  | 'nativeCallIntegration'

export type MobileMediaPermissionStatus =
  | 'granted'
  | 'denied'
  | 'promptable'
  | 'unsupported'
  | 'system-settings-required'

export type MobileMediaPermissions = Record<MobileMediaPermissionKind, MobileMediaPermissionStatus>

export type MobileMediaPermissionRow = {
  kind: MobileMediaPermissionKind
  label: string
  status: MobileMediaPermissionStatus
  purpose: string
  canRequest: boolean
}

export type MobileVoiceMediaState = {
  displayName?: string
  roomName: string
  participantIdentity: string
  canPublishAudio: boolean
  canPublishScreen: boolean
  canSubscribe: boolean
  remoteScreenShares: number
  remoteScreenShareStreams: NativeScreenShareStream[]
}

export type MobileVoiceState = {
  connectedChannelId: string | null
  connectionStatus: 'idle' | 'connecting' | 'connected' | 'blocked' | 'failed'
  errorMessage: string | null
  selfMute: boolean
  selfDeaf: boolean
  media: MobileVoiceMediaState | null
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
  sessionToken: string | null
  channels: MobileChannel[]
  selectedChannelId: string
  messages: MobileMessage[]
  realtimeStatus: RealtimeConnectionStatus
  pushRegistration: MobilePushRegistration
  mediaPermissions: MobileMediaPermissions
  voice: MobileVoiceState
}

export type MobileAction =
  | { type: 'login.submit'; serverUrl: string; email: string }
  | {
      type: 'login.succeeded'
      serverUrl: string
      email: string
      displayName: string
      sessionToken: string
      channels: MobileChannel[]
    }
  | { type: 'logout' }
  | { type: 'channel.select'; channelId: string }
  | { type: 'channel.back' }
  | {
      type: 'message.send'
      content: string
      attachments?: MobileMessageAttachment[]
      clientId?: string
      deliveryStatus?: MobileMessage['deliveryStatus']
      errorMessage?: string
      now?: string
      replyToMessageId?: string
    }
  | { type: 'message.retry'; messageId: string; now?: string }
  | { type: 'message.edit'; messageId: string; content: string; now?: string }
  | { type: 'message.delete'; messageId: string }
  | { type: 'message.pin'; messageId: string; pinned: boolean }
  | { type: 'message.react'; messageId: string; emoji: string }
  | { type: 'realtime.status_changed'; status: RealtimeConnectionStatus }
  | { type: 'realtime.message_created'; envelope: RealtimeIncomingEnvelope }
  | { type: 'realtime.media_permission_revoked'; envelope: RealtimeIncomingEnvelope }
  | {
      type: 'permission.updated'
      kind: MobileMediaPermissionKind
      status: MobileMediaPermissionStatus
    }
  | { type: 'voice.join'; channelId: string }
  | { type: 'voice.media_connecting'; channelId: string; displayName?: string }
  | {
      type: 'voice.media_connected'
      channelId: string
      media: Omit<
        MobileVoiceMediaState,
        'canPublishScreen' | 'remoteScreenShares' | 'remoteScreenShareStreams'
      > & {
        canPublishScreen?: boolean
        remoteScreenShares?: number
        remoteScreenShareStreams?: NativeScreenShareStream[]
      }
    }
  | { type: 'voice.media_failed'; message: string }
  | {
      type: 'voice.remote_screen_shares_updated'
      count?: number
      streams?: NativeScreenShareStream[]
    }
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
    category: 'Text channels',
    mentionCount: 2,
    organizationId: DEFAULT_MOBILE_ORGANIZATION_ID,
    spaceId: DEFAULT_MOBILE_SPACE_ID,
    spaceName: DEFAULT_MOBILE_SPACE_NAME,
  },
  {
    id: 'backend',
    kind: 'text',
    name: 'backend',
    topic: 'API, realtime, permissions, and deployment work.',
    unread: false,
    category: 'Text channels',
    organizationId: DEFAULT_MOBILE_ORGANIZATION_ID,
    spaceId: DEFAULT_MOBILE_SPACE_ID,
    spaceName: DEFAULT_MOBILE_SPACE_NAME,
  },
  {
    id: 'announcements',
    kind: 'text',
    name: 'announcements',
    topic: 'Read-only release notes and notices.',
    unread: false,
    category: 'Text channels',
    organizationId: DEFAULT_MOBILE_ORGANIZATION_ID,
    spaceId: DEFAULT_MOBILE_SPACE_ID,
    spaceName: DEFAULT_MOBILE_SPACE_NAME,
  },
  {
    id: 'standup',
    kind: 'voice',
    name: 'standup',
    topic: 'Daily mobile voice check-in.',
    unread: false,
    category: 'Voice channels',
    organizationId: DEFAULT_MOBILE_ORGANIZATION_ID,
    spaceId: DEFAULT_MOBILE_SPACE_ID,
    spaceName: DEFAULT_MOBILE_SPACE_NAME,
  },
  {
    id: 'office-hours',
    kind: 'voice',
    name: 'office-hours',
    topic: 'Drop-in support voice room.',
    unread: false,
    category: 'Voice channels',
    organizationId: DEFAULT_MOBILE_ORGANIZATION_ID,
    spaceId: DEFAULT_MOBILE_SPACE_ID,
    spaceName: DEFAULT_MOBILE_SPACE_NAME,
  },
]

const initialMessages: MobileMessage[] = [
  {
    id: 'seed-1',
    channelId: 'general',
    authorName: 'Release Hook',
    authorKind: 'webhook',
    authorBadge: 'WEBHOOK',
    avatarUrl: 'https://chat.example.com/hook.png',
    content: 'Deploy preview ready',
    attachments: [
      {
        id: 'seed-attachment-1',
        fileName: 'local-alpha-readme.txt',
        contentType: 'text/plain',
        sizeBytes: 87,
        status: 'linked',
        downloadUrl: 'https://chat.example.com/attachments/seed-attachment-1/content',
      },
    ],
    components: [],
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
    deliveryStatus: 'sent',
    mentions: [],
  },
  {
    id: 'seed-bot-1',
    channelId: 'general',
    authorName: 'OpenCord Bot',
    authorKind: 'bot',
    authorBadge: 'BOT',
    content: 'Use the buttons from desktop or web while native component actions are being wired.',
    attachments: [],
    components: [
      {
        id: 'seed:ack',
        label: 'Acknowledge',
        disabled: false,
      },
      {
        id: 'seed:details',
        label: 'View details',
        disabled: true,
      },
    ],
    embeds: [],
    time: '09:12',
    own: false,
    deliveryStatus: 'sent',
    mentions: [],
  },
  {
    id: 'seed-2',
    channelId: 'backend',
    authorName: 'Thanet',
    authorKind: 'user',
    content: 'Shared API and realtime packages are available to mobile now.',
    attachments: [],
    components: [],
    embeds: [],
    time: '09:16',
    own: false,
    deliveryStatus: 'sent',
    mentions: [],
  },
]

const initialVoiceState: MobileVoiceState = {
  connectedChannelId: null,
  connectionStatus: 'idle',
  errorMessage: null,
  selfMute: false,
  selfDeaf: false,
  media: null,
  participants: [
    { id: 'voice-u1', channelId: 'standup', name: 'Mira', status: 'speaking' },
    { id: 'voice-u2', channelId: 'office-hours', name: 'Thanet', status: 'connected' },
  ],
}

const initialMediaPermissions: MobileMediaPermissions = {
  microphone: 'promptable',
  camera: 'promptable',
  screenShare: 'promptable',
  speaker: 'unsupported',
  notifications: 'promptable',
  nativeCallIntegration: 'promptable',
}

const mediaPermissionRows: Array<Omit<MobileMediaPermissionRow, 'status' | 'canRequest'>> = [
  {
    kind: 'microphone',
    label: 'Microphone',
    purpose: 'Used when you speak in voice channels or meetings.',
  },
  {
    kind: 'camera',
    label: 'Camera',
    purpose: 'Used when you turn on video in meetings.',
  },
  {
    kind: 'screenShare',
    label: 'Screen sharing',
    purpose: 'Used when you share a screen, window, or tab.',
  },
  {
    kind: 'speaker',
    label: 'Speaker',
    purpose: 'Used to play remote call audio through the selected output.',
  },
  {
    kind: 'notifications',
    label: 'Notifications',
    purpose: 'Used for incoming call and meeting alerts.',
  },
  {
    kind: 'nativeCallIntegration',
    label: 'Native call integration',
    purpose:
      'Used to keep OpenCord voice and meeting audio visible on the lock screen and in system call controls.',
  },
]

export function createInitialMobileState({
  defaultServerUrl = DEFAULT_MOBILE_OPENCORD_SERVER_URL,
}: {
  defaultServerUrl?: string
} = {}): MobileAppState {
  const serverConnections = createDefaultMobileServerConnectionState(defaultServerUrl)
  const activeConnection = activeServerConnection(serverConnections)

  return {
    screen: 'login',
    serverUrl: activeConnection?.baseUrl ?? DEFAULT_MOBILE_OPENCORD_SERVER_URL,
    serverConnections,
    account: null,
    sessionToken: null,
    channels: initialChannels,
    selectedChannelId: initialChannels[0].id,
    messages: initialMessages,
    realtimeStatus: INITIAL_REALTIME_STATUS,
    pushRegistration: { status: 'idle' },
    mediaPermissions: initialMediaPermissions,
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
        sessionToken: null,
      }
    }
    case 'login.succeeded': {
      const serverConnections = upsertServerConnection(state.serverConnections, {
        baseUrl: action.serverUrl,
      })
      const activeConnection = activeServerConnection(serverConnections)
      const channels = action.channels.length > 0 ? action.channels : state.channels

      return {
        ...state,
        screen: 'channels',
        serverUrl: activeConnection?.baseUrl ?? normalizeOpenCordBaseUrl(action.serverUrl),
        serverConnections,
        account: {
          email: action.email,
          displayName: action.displayName,
        },
        sessionToken: action.sessionToken,
        channels,
        selectedChannelId: channels[0]?.id ?? state.selectedChannelId,
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
      const attachments = action.attachments ?? []
      if (!content && attachments.length === 0) {
        return state
      }
      const channel = selectedChannel(state)
      if (channel.kind !== 'text') {
        return state
      }
      const deliveryStatus = action.deliveryStatus ?? 'sent'

      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: action.clientId ?? `local-${Date.now()}`,
            channelId: state.selectedChannelId,
            authorName: 'You',
            authorKind: 'user',
            attachments,
            components: [],
            content,
            deliveryError: deliveryStatus === 'failed' ? action.errorMessage ?? 'Unable to send.' : null,
            deliveryStatus,
            embeds: [],
            mentions: mobileMentionTokens(content),
            own: true,
            replyToMessageId: action.replyToMessageId,
            time: action.now ?? 'now',
          },
        ],
      }
    }
    case 'message.retry':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId && message.own && !message.deleted
            ? {
                ...message,
                deliveryError: null,
                deliveryStatus: 'sending',
                time: action.now ?? message.time,
              }
            : message,
        ),
      }
    case 'message.edit': {
      const content = action.content.trim()
      if (!content) {
        return state
      }

      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId && message.own && !message.deleted
            ? {
                ...message,
                content,
                deliveryError: null,
                deliveryStatus: 'sent',
                edited: true,
                editedAt: action.now ?? 'now',
                mentions: mobileMentionTokens(content),
              }
            : message,
        ),
      }
    }
    case 'message.delete':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId && message.own && !message.deleted
            ? {
                ...message,
                content: '',
                deleted: true,
                attachments: [],
                components: [],
                deliveryError: null,
                deliveryStatus: 'sent',
                embeds: [],
                mentions: [],
                reactions: [],
              }
            : message,
        ),
      }
    case 'message.pin':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId && !message.deleted
            ? {
                ...message,
                pinned: action.pinned,
              }
            : message,
        ),
      }
    case 'message.react':
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.messageId && !message.deleted
            ? {
                ...message,
                reactions: applyMobileReaction(message.reactions ?? [], action.emoji),
              }
            : message,
        ),
      }
    case 'realtime.status_changed':
      return {
        ...state,
        realtimeStatus: action.status,
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
    case 'realtime.media_permission_revoked':
      return applyMobileMediaPermissionRevocation(state, action.envelope)
    case 'permission.updated': {
      const mediaPermissions = {
        ...state.mediaPermissions,
        [action.kind]: action.status,
      }
      const clearsMicrophoneBlock =
        action.kind === 'microphone' &&
        action.status === 'granted' &&
        state.voice.connectionStatus === 'blocked'

      return {
        ...state,
        mediaPermissions,
        voice: clearsMicrophoneBlock
          ? {
              ...state.voice,
              connectionStatus: 'idle',
              errorMessage: null,
            }
          : state.voice,
      }
    }
    case 'voice.join': {
      const channel = state.channels.find((candidate) => candidate.id === action.channelId)
      if (channel?.kind !== 'voice') {
        return state
      }
      if (!mobileCanJoinVoice(state)) {
        return {
          ...state,
          voice: {
            ...state.voice,
            connectedChannelId: null,
            connectionStatus: 'blocked',
            errorMessage: 'Microphone permission is required before joining voice.',
            media: null,
            participants: state.voice.participants.filter((participant) => !participant.self),
          },
        }
      }

      return {
        ...state,
        voice: {
          ...state.voice,
          connectedChannelId: channel.id,
          connectionStatus: 'connected',
          errorMessage: null,
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
    case 'voice.media_connecting': {
      const channel = state.channels.find((candidate) => candidate.id === action.channelId)
      if (channel?.kind !== 'voice' && !action.displayName) {
        return state
      }
      if (!mobileCanJoinVoice(state)) {
        return {
          ...state,
          voice: {
            ...state.voice,
            connectedChannelId: null,
            connectionStatus: 'blocked',
            errorMessage: 'Microphone permission is required before joining voice.',
            media: null,
            participants: state.voice.participants.filter((participant) => !participant.self),
          },
        }
      }

      return {
        ...state,
        voice: {
          ...state.voice,
          connectedChannelId: action.channelId,
          connectionStatus: 'connecting',
          errorMessage: null,
          media: null,
          participants: [
            ...state.voice.participants.filter((participant) => !participant.self),
            {
              id: 'voice-self',
              channelId: action.channelId,
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
    case 'voice.media_connected':
      return {
        ...state,
        voice: {
          ...state.voice,
          connectedChannelId: action.channelId,
          connectionStatus: 'connected',
          errorMessage: null,
          media: {
            ...action.media,
            canPublishScreen: action.media.canPublishScreen ?? false,
            remoteScreenShareStreams: action.media.remoteScreenShareStreams ?? [],
            remoteScreenShares:
              action.media.remoteScreenShares ??
              action.media.remoteScreenShareStreams?.length ??
              0,
          },
        },
      }
    case 'voice.media_failed':
      return {
        ...state,
        voice: {
          ...state.voice,
          connectedChannelId: null,
          connectionStatus: 'failed',
          errorMessage: action.message,
          media: null,
          participants: state.voice.participants.filter((participant) => !participant.self),
        },
      }
    case 'voice.remote_screen_shares_updated':
      return {
        ...state,
        voice: state.voice.media
          ? {
              ...state.voice,
              media: {
                ...state.voice.media,
                remoteScreenShareStreams:
                  action.streams ?? state.voice.media.remoteScreenShareStreams,
                remoteScreenShares:
                  action.count ?? action.streams?.length ?? state.voice.media.remoteScreenShares,
              },
            }
          : state.voice,
      }
    case 'voice.leave':
      return {
        ...state,
        voice: {
          ...state.voice,
          connectedChannelId: null,
          connectionStatus: 'idle',
          errorMessage: null,
          selfMute: false,
          selfDeaf: false,
          media: null,
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
      const removesOnlyConnection =
        state.serverConnections.connections.length === 1 &&
        state.serverConnections.connections[0]?.id === action.connectionId
      const serverConnections = removesOnlyConnection
        ? createDefaultMobileServerConnectionState()
        : removeServerConnection(state.serverConnections, action.connectionId)
      const activeConnection = activeServerConnection(serverConnections)

      return {
        ...state,
        serverUrl: activeConnection?.baseUrl ?? DEFAULT_MOBILE_OPENCORD_SERVER_URL,
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

export function mobileMessageTimelineGroups(
  state: MobileAppState,
  channelId = state.selectedChannelId,
): MobileMessageTimelineGroup[] {
  const groups: MobileMessageTimelineGroup[] = []

  for (const message of messagesForChannel(state, channelId)) {
    const currentGroup = groups.at(-1)
    if (
      currentGroup &&
      currentGroup.authorName === message.authorName &&
      currentGroup.authorKind === message.authorKind &&
      currentGroup.own === message.own
    ) {
      currentGroup.messages.push(message)
      continue
    }

    groups.push({
      id: `group-${message.id}`,
      authorName: message.authorName,
      authorKind: message.authorKind,
      authorBadge: message.authorBadge,
      avatarUrl: message.avatarUrl,
      own: message.own,
      messages: [message],
    })
  }

  return groups
}

export function mobileComposerState(
  state: MobileAppState,
  content: string,
  {
    editTargetMessageId,
    pendingAttachmentCount = 0,
    replyTargetMessageId,
  }: {
    editTargetMessageId?: string | null
    pendingAttachmentCount?: number
    replyTargetMessageId?: string | null
  } = {},
): MobileComposerUiState {
  const channel = selectedChannel(state)
  const mode = editTargetMessageId ? 'edit' : replyTargetMessageId ? 'reply' : 'send'
  const placeholder =
    mode === 'edit'
      ? 'Edit message'
      : mode === 'reply'
        ? `Reply in #${channel.name}`
        : `Message #${channel.name}`

  if (channel.kind !== 'text') {
    return {
      canSend: false,
      disabledReason: 'Text messages can be sent only in text channels.',
      mode,
      pendingAttachmentCount,
      placeholder,
    }
  }

  if (mode === 'edit' && pendingAttachmentCount > 0) {
    return {
      canSend: false,
      disabledReason: 'Save the edit before adding attachments.',
      mode,
      pendingAttachmentCount,
      placeholder,
    }
  }

  if (!content.trim() && pendingAttachmentCount === 0) {
    return {
      canSend: false,
      disabledReason: 'Write a message before sending.',
      mode,
      pendingAttachmentCount,
      placeholder,
    }
  }

  return {
    canSend: true,
    disabledReason: null,
    mode,
    pendingAttachmentCount,
    placeholder,
  }
}

export function mobileMessageActionSheetOptions(
  state: MobileAppState,
  messageId: string,
): MobileMessageActionOption[] {
  const message = state.messages.find((candidate) => candidate.id === messageId)
  if (!message || message.deleted) {
    return []
  }

  if (message.own) {
    return [
      { id: 'reply', label: 'Reply' },
      { id: 'edit', label: 'Edit' },
      { id: 'delete', label: 'Delete', destructive: true },
      { id: 'copy', label: 'Copy text' },
      { id: 'pin', label: message.pinned ? 'Unpin' : 'Pin' },
      { id: 'react', label: 'React' },
    ]
  }

  return [
    { id: 'reply', label: 'Reply' },
    { id: 'copy', label: 'Copy text' },
    { id: 'pin', label: message.pinned ? 'Unpin' : 'Pin' },
    { id: 'react', label: 'React' },
    { id: 'report', label: 'Report', destructive: true },
  ]
}

export function mobileMentionTokens(content: string): MobileMentionToken[] {
  const tokens: MobileMentionToken[] = []
  const mentionPattern = /(^|[\s([{])@([A-Za-z0-9][A-Za-z0-9_-]{0,31})/g
  let match: RegExpExecArray | null

  while ((match = mentionPattern.exec(content)) !== null) {
    const prefix = match[1] ?? ''
    const display = match[2] ?? ''
    const start = match.index + prefix.length
    const end = start + display.length + 1

    tokens.push({
      display,
      query: display.toLowerCase(),
      start,
      end,
    })
  }

  return tokens
}

export function mobileMediaPermissionRows(state: MobileAppState): MobileMediaPermissionRow[] {
  return mediaPermissionRows.map((row) => {
    const status = state.mediaPermissions[row.kind]

    return {
      ...row,
      status,
      canRequest: status === 'promptable' || status === 'denied',
    }
  })
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

export function mobileCanJoinVoice(state: MobileAppState) {
  return state.mediaPermissions.microphone === 'granted'
}

export function mobileWorkspaceNavigatorSections(
  state: MobileAppState,
): MobileWorkspaceNavigatorSection[] {
  const sections = new Map<string, MobileWorkspaceNavigatorSection>()

  for (const channel of state.channels) {
    const spaceId = channel.spaceId ?? DEFAULT_MOBILE_SPACE_ID
    const spaceName = channel.spaceName ?? DEFAULT_MOBILE_SPACE_NAME
    const category = channel.category ?? (channel.kind === 'voice' ? 'Voice channels' : 'Text channels')
    const sectionId = `${spaceId}-${slugValue(category)}`
    const section = sections.get(sectionId) ?? {
      id: sectionId,
      title: `${spaceName} / ${category}`,
      spaceId,
      channels: [],
    }

    section.channels.push({
      id: channel.id,
      kind: channel.kind,
      name: channel.name,
      topic: channel.topic,
      connected: state.voice.connectedChannelId === channel.id,
      mentionCount: channel.mentionCount ?? 0,
      selected: state.selectedChannelId === channel.id,
      unread: channel.unread,
      voiceOccupancy:
        channel.kind === 'voice'
          ? mobileVoiceParticipantsForChannel(state, channel.id).length || (channel.voiceOccupancy ?? 0)
          : 0,
    })
    sections.set(sectionId, section)
  }

  return Array.from(sections.values())
}

export function mobileRouteTargetForChannel(
  state: MobileAppState,
  channelId = state.selectedChannelId,
): OpenCordRouteTarget | null {
  const channel = state.channels.find((candidate) => candidate.id === channelId)
  if (!channel) {
    return null
  }

  return {
    kind: 'channel',
    serverId: mobileServerRouteId(activeMobileServerConnection(state)),
    organizationId: channel.organizationId ?? DEFAULT_MOBILE_ORGANIZATION_ID,
    spaceId: channel.spaceId ?? DEFAULT_MOBILE_SPACE_ID,
    channelId: channel.id,
  }
}

export function mobileChannelsFromApiChannels(channels: Channel[]): MobileChannel[] {
  return channels.map((channel) => ({
    id: channel.id,
    kind: channel.kind,
    name: channel.name,
    topic: channel.topic ?? (channel.kind === 'voice' ? 'Voice channel' : ''),
    unread: false,
  }))
}

export function selectedChannel(state: MobileAppState) {
  return (
    state.channels.find((channel) => channel.id === state.selectedChannelId) ?? state.channels[0]
  )
}

export function activeMobileServerConnection(state: MobileAppState) {
  return activeServerConnection(state.serverConnections)
}

function mobileServerRouteId(connection: ServerConnection | null) {
  if (!connection) {
    return 'local-opencord'
  }

  return slugValue(connection.displayName) || connection.id
}

function createDefaultMobileServerConnectionState(defaultServerUrl = DEFAULT_MOBILE_OPENCORD_SERVER_URL) {
  return createDefaultServerConnectionState({
    baseUrl: defaultServerUrl,
    displayName: 'Local OpenCord',
  })
}

function displayNameForEmail(email: string) {
  return email.split('@')[0] || 'OpenCord user'
}

function slugValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
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
  const attachments = mobileMessageAttachmentsValue(message.attachments)
  const components = mobileMessageComponentsValue(message.components)
  const embeds = richEmbedsValue(message.embeds)
  if (!channelId || (!content && attachments.length === 0 && components.length === 0 && embeds.length === 0)) {
    return null
  }
  const webhookUsername = stringValue(message.webhook_username)
  const authorKind =
    mobileMessageAuthorKindValue(message.author_kind) ??
    (webhookUsername ? 'webhook' : components.length > 0 ? 'bot' : 'user')

  return {
    id: stringValue(message.id) ?? envelope.id,
    channelId,
    authorName: webhookUsername ?? stringValue(message.author_display_name) ?? stringValue(message.author_user_id) ?? 'Unknown user',
    authorKind,
    authorBadge: mobileAuthorBadge(authorKind),
    avatarUrl: stringValue(message.webhook_avatar_url),
    attachments,
    components,
    content,
    embeds,
    time: timeLabel(envelope.occurred_at),
    own: false,
  }
}

function applyMobileMediaPermissionRevocation(
  state: MobileAppState,
  envelope: RealtimeIncomingEnvelope,
): MobileAppState {
  if (envelope.type !== 'media.permission_revoked' || !('data' in envelope)) {
    return state
  }

  const media = state.voice.media
  const data = objectValue(envelope.data)
  const grants = objectValue(data.grants)
  const channelId = stringValue(data.channel_id) ?? envelope.scope.channel_id
  const targetKind = stringValue(data.target_kind)
  const targetId = stringValue(data.target_id)
  if (
    !media ||
    !state.voice.connectedChannelId ||
    channelId !== state.voice.connectedChannelId ||
    targetKind !== 'member' ||
    targetId !== media.participantIdentity
  ) {
    return state
  }

  if (data.action === 'disconnect' || grants.can_subscribe === false) {
    return {
      ...state,
      voice: {
        ...state.voice,
        connectedChannelId: null,
        connectionStatus: 'blocked',
        errorMessage: 'Voice access changed. You were removed from the channel.',
        selfMute: false,
        selfDeaf: false,
        media: null,
        participants: state.voice.participants.filter((participant) => !participant.self),
      },
    }
  }

  let errorMessage = state.voice.errorMessage
  let selfMute = state.voice.selfMute
  let nextMedia = media
  let participants = state.voice.participants
  if (grants.can_publish_audio === false && media.canPublishAudio) {
    selfMute = true
    nextMedia = {
      ...nextMedia,
      canPublishAudio: false,
    }
    participants = updateMobileSelfVoiceStatus(
      {
        ...state.voice,
        selfMute,
        participants,
      },
      {
        selfDeaf: state.voice.selfDeaf,
        selfMute,
      },
    )
    errorMessage = 'Voice permissions changed. Your microphone was muted.'
  }
  if (grants.can_publish_screen === false && media.canPublishScreen) {
    nextMedia = {
      ...nextMedia,
      canPublishScreen: false,
    }
    errorMessage = 'Voice permissions changed. Screen sharing stopped.'
  }

  if (nextMedia === media && selfMute === state.voice.selfMute) {
    return state
  }

  return {
    ...state,
    voice: {
      ...state.voice,
      errorMessage,
      selfMute,
      media: nextMedia,
      participants,
    },
  }
}

function applyMobileReaction(
  reactions: MobileMessageReaction[],
  emoji: string,
): MobileMessageReaction[] {
  const existing = reactions.find((reaction) => reaction.emoji === emoji)
  if (!existing) {
    return [...reactions, { emoji, count: 1, selfReacted: true }]
  }

  return reactions.map((reaction) =>
    reaction.emoji === emoji
      ? {
          ...reaction,
          count: reaction.selfReacted ? reaction.count : reaction.count + 1,
          selfReacted: true,
        }
      : reaction,
  )
}

function mobileMessageAttachmentsValue(value: unknown): MobileMessageAttachment[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((candidate) => {
    const attachment = objectValue(candidate)
    const id = stringValue(attachment.id)
    const fileName = stringValue(attachment.file_name)
    if (!id || !fileName) {
      return []
    }

    return [
      {
        id,
        fileName,
        contentType: stringValue(attachment.content_type) ?? 'application/octet-stream',
        sizeBytes: numberValue(attachment.size_bytes) ?? 0,
        status: stringValue(attachment.status) ?? 'linked',
        downloadUrl: stringValue(attachment.download_url) ?? '',
      },
    ]
  })
}

function mobileMessageComponentsValue(value: unknown): MobileMessageComponent[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((candidate, rowIndex) => {
    const row = objectValue(candidate)
    const rowComponents = Array.isArray(row.components) ? row.components : [candidate]

    return rowComponents.flatMap((component, componentIndex) => {
      const item = objectValue(component)
      const label = stringValue(item.label)
      const customId = stringValue(item.custom_id)
      if (!label) {
        return []
      }

      return [
        {
          id: customId ?? `component-${rowIndex}-${componentIndex}`,
          label,
          disabled: booleanValue(item.disabled) ?? false,
        },
      ]
    })
  })
}

function mobileMessageAuthorKindValue(value: unknown): MobileMessageAuthorKind | undefined {
  return value === 'user' || value === 'bot' || value === 'webhook' || value === 'system'
    ? value
    : undefined
}

function mobileAuthorBadge(authorKind: MobileMessageAuthorKind) {
  switch (authorKind) {
    case 'bot':
      return 'BOT'
    case 'webhook':
      return 'WEBHOOK'
    case 'system':
      return 'SYSTEM'
    case 'user':
      return undefined
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
