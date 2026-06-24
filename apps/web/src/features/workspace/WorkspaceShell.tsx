import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode, RefObject } from 'react'
import {
  createOpenCordApiClient,
  OpenCordApiError,
  type AuthResult,
  type AuthUser,
  type Channel as ApiChannel,
  type IncomingWebhook,
  type IncomingWebhookWithToken,
  type Meeting as ApiMeeting,
  type Message as ApiMessage,
  type Organization,
  type ServerHealth,
  type Space as ApiSpace,
} from '@opencord/api-client'
import {
  connectLiveKitVoice,
  type LiveKitVoiceSession,
  type LiveKitVoiceState,
} from '@opencord/media'
import {
  INITIAL_REALTIME_STATUS,
  createOpenCordRealtimeClient,
  realtimeUrlForServer,
  type RealtimeConnectionStatus,
  type RealtimeEventEnvelope,
  type RealtimeIncomingEnvelope,
} from '@opencord/realtime'
import {
  activeServerConnection,
  clearActiveDeviceSession,
  createDefaultServerConnectionState,
  loadActiveDeviceSession,
  loadServerConnectionState,
  persistDeviceSession,
  removeServerConnection,
  saveServerConnectionState,
  switchServerConnection,
  upsertServerConnection,
  type DeviceSessionStores,
  type ServerConnection,
} from '@opencord/server-connections'
import {
  displayOpenCordChannelName,
  formatOpenCordMeetingClock,
  formatOpenCordMeetingDay,
  normalizeOpenCordChannelName,
  openCordMeetingChannelLabel,
  slugOpenCordTitle,
  type OpenCordSettingsPanel,
} from '@opencord/client-contracts'

import { WorkspaceLayout } from '../../layouts/WorkspaceLayout'
import { useWorkspaceUiStore } from './state/workspaceUiStore'
import type { ActivePanel } from './workspaceTypes'

import '../../App.css'

type HealthState = { status: 'checking' } | ServerHealth

type Space = {
  id: string
  name: string
  initials: string
  unread: boolean
  mentions: number
}

type Channel = {
  id: string
  spaceId: string
  kind: 'text' | 'voice'
  name: string
  topic: string
  category: string
  canSend: boolean
  unread: boolean
  private: boolean
}

type ChatMessage = {
  id: string
  channelId: string
  author: string
  role: string
  time: string
  body: string
  own: boolean
  embeds: RichEmbed[]
  attachments: MessageAttachment[]
  edited?: boolean
}

type RichEmbed = {
  type?: 'rich'
  title?: string
  description?: string
  url?: string
  timestamp?: string
  color?: number
  author?: {
    name: string
    url?: string
    icon_url?: string
  }
  footer?: {
    text: string
    icon_url?: string
  }
  image?: {
    url: string
  }
  thumbnail?: {
    url: string
  }
  fields?: RichEmbedField[]
}

type RichEmbedField = {
  name: string
  value: string
  inline?: boolean
}

type MessageAttachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  previewUrl?: string
}

type Member = {
  id: string
  name: string
  role: string
  presence: 'online' | 'idle' | 'offline'
}

type VoiceParticipant = {
  id: string
  channelId: string
  name: string
  status: 'connected' | 'speaking' | 'muted' | 'deafened'
  self?: boolean
}

type VoiceState = {
  connectedChannelId: string | null
  mediaReady: boolean
  selfMute: boolean
  selfDeaf: boolean
  participants: VoiceParticipant[]
}

type LocalAlphaSessionSnapshot = {
  baseUrl: string
  email: string
  displayName: string
  user: AuthUser
  organization: Organization
  reconnectVoiceChannelId: string | null
}

type ScreenShareState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'sharing'; stream: MediaStream }
  | { status: 'error'; message: string }

type DeveloperBot = {
  id: string
  organizationId?: string
  botUserId?: string
  name: string
  description: string
  token: string
  permissions: DeveloperPermissionId[]
  invitedSpaceIds: string[]
  serverManaged?: boolean
}

type DeveloperPermissionId =
  | 'read_messages'
  | 'send_messages'
  | 'use_slash_commands'
  | 'manage_webhooks'

type DeveloperPermissionOption = {
  id: DeveloperPermissionId
  label: string
}

type DeveloperAuditEvent = {
  id: string
  type: string
  target: string
  detail: string
  time: string
}

type DeveloperWebhook = {
  id: string
  channelId: string
  name: string
  token: string
  tokenLastFour: string
  executeUrl: string
  serverManaged?: boolean
}

type CalendarMeeting = {
  id: string
  title: string
  startsAt: string
  endsAt: string
  channelId: string
  organizer: string
  joinUrl: string
  status: 'scheduled' | 'cancelled'
}

type MeetingRoomParticipant = {
  id: string
  name: string
  role: string
  self?: boolean
}

type MeetingRoomState = {
  meeting: CalendarMeeting
  mediaStatus: 'connecting' | 'connected' | 'error'
  mediaError?: string
  selfMute: boolean
  cameraOff: boolean
  participants: MeetingRoomParticipant[]
}

type OpenCordDesktopRuntime = {
  desktopCommands?: {
    onCommand(handler: (command: OpenCordDesktopCommand) => void): () => void
  }
  desktopState?: {
    update(payload: OpenCordDesktopClientState): Promise<boolean>
  }
  screenShare?: {
    onPickerRequest(
      handler: (request: OpenCordDesktopCapturePickerRequest) => void,
    ): () => void
    respond(response: OpenCordDesktopCapturePickerResponse): Promise<boolean>
  }
  deviceSessions?: {
    getSecret(key: string): Promise<string | null>
    removeSecret(key: string): Promise<boolean>
    setSecret(key: string, value: string): Promise<boolean>
  }
  deepLinks?: {
    onRoute(handler: (route: { routePath: string; target: { kind: string } }) => void): () => void
  }
  lifecycle?: {
    onState(handler: (state: OpenCordDesktopLifecycleState) => void): () => void
  }
  notifications?: {
    showMessage(payload: {
      authorName: string
      body: string
      channelName: string
      notificationLink?: string
      own: boolean
    }): Promise<boolean>
  }
  platform: string
  versions?: {
    chrome?: string
    electron?: string
    node?: string
  }
}

type OpenCordDesktopServerState = {
  active: boolean
  id: string
  name: string
  url: string
}

type OpenCordDesktopChannelState = {
  id: string
  kind: 'text' | 'voice'
  name: string
  spaceId: string
}

type OpenCordDesktopClientState = {
  activeChannel: OpenCordDesktopChannelState | null
  activeServer: OpenCordDesktopServerState
  activeSpace: {
    id: string
    name: string
  } | null
  channels: OpenCordDesktopChannelState[]
  servers: OpenCordDesktopServerState[]
  voice: {
    channelId: string | null
    channelName: string | null
    connected: boolean
    deafened: boolean
    muted: boolean
    screenSharing: boolean
  }
}

type OpenCordDesktopCommand =
  | { kind: 'select-server'; serverId: string }
  | { kind: 'select-channel'; channelId: string }
  | { kind: 'show-channel-search' }
  | { kind: 'show-settings'; panel: OpenCordSettingsPanel }
  | { kind: 'voice-toggle-mute' }
  | { kind: 'voice-toggle-deafen' }
  | { kind: 'voice-leave' }
  | { kind: 'screen-share-toggle' }

type OpenCordDesktopCaptureSource = {
  id: string
  kind: 'screen' | 'window'
  name: string
  thumbnailDataUrl: string | null
}

type OpenCordDesktopCapturePickerRequest = {
  requestId: string
  sources: OpenCordDesktopCaptureSource[]
}

type OpenCordDesktopCapturePickerResponse = {
  requestId: string
  sourceId: string | null
}

type OpenCordDesktopLifecycleState = {
  backgroundRealtime: boolean
  focused: boolean
  visibility: 'visible' | 'hidden' | 'minimized'
}

declare global {
  interface Window {
    __OPENCORD_MEDIA_RTC_CONFIG__?: RTCConfiguration
    openCordDesktop?: OpenCordDesktopRuntime
  }
}

const initialSpaces: Space[] = [
  { id: 'opencord', name: 'OpenCord', initials: 'OC', unread: true, mentions: 2 },
  { id: 'platform', name: 'Platform', initials: 'PF', unread: false, mentions: 0 },
  { id: 'design', name: 'Design', initials: 'DS', unread: true, mentions: 0 },
]

const initialChannels: Channel[] = [
  {
    id: 'general',
    spaceId: 'opencord',
    kind: 'text',
    name: 'general',
    topic: 'Daily product coordination and chat core development.',
    category: 'Text channels',
    canSend: true,
    unread: true,
    private: false,
  },
  {
    id: 'announcements',
    spaceId: 'opencord',
    kind: 'text',
    name: 'announcements',
    topic: 'Read-only release notes and operational notices.',
    category: 'Text channels',
    canSend: false,
    unread: false,
    private: false,
  },
  {
    id: 'backend',
    spaceId: 'opencord',
    kind: 'text',
    name: 'backend',
    topic: 'Rust API, permissions, realtime, and storage.',
    category: 'Engineering',
    canSend: true,
    unread: false,
    private: false,
  },
  {
    id: 'moderators',
    spaceId: 'opencord',
    kind: 'text',
    name: 'moderators',
    topic: 'Private review queue for permission and abuse handling.',
    category: 'Engineering',
    canSend: true,
    unread: false,
    private: true,
  },
  {
    id: 'standup',
    spaceId: 'opencord',
    kind: 'voice',
    name: 'standup',
    topic: 'Daily planning voice channel.',
    category: 'Voice channels',
    canSend: false,
    unread: false,
    private: false,
  },
  {
    id: 'office-hours',
    spaceId: 'opencord',
    kind: 'voice',
    name: 'office-hours',
    topic: 'Drop-in support and pair debugging.',
    category: 'Voice channels',
    canSend: false,
    unread: false,
    private: false,
  },
]

const initialMessages: ChatMessage[] = [
  {
    id: 'm1',
    channelId: 'general',
    author: 'Thanet',
    role: 'Owner',
    time: '09:14',
    body: 'Welcome to OpenCord. The first chat core is coming together: auth, spaces, channels, messages, permissions, and realtime.',
    own: false,
    embeds: [],
    attachments: [],
  },
  {
    id: 'm2',
    channelId: 'general',
    author: 'Mira',
    role: 'Product',
    time: '09:22',
    body: 'The web client should feel familiar for Discord users but calmer for company work.',
    own: false,
    embeds: [
      {
        type: 'rich',
        title: 'Deploy preview ready',
        description: 'Webhook embed payloads now render in official clients.',
        url: 'https://opencord.local/deploys/2026.06.24',
        color: 2644333,
        fields: [
          { name: 'Environment', value: 'production', inline: true },
          { name: 'Version', value: '2026.06.24', inline: true },
        ],
        footer: { text: 'Release Hook' },
        timestamp: '2026-06-24T09:22:00.000Z',
      },
    ],
    attachments: [],
  },
  {
    id: 'm3',
    channelId: 'general',
    author: 'You',
    role: 'Maintainer',
    time: '09:31',
    body: 'I am wiring the Phase 01 shell so the backend work has a usable surface.',
    own: true,
    embeds: [],
    attachments: [],
  },
  {
    id: 'm4',
    channelId: 'announcements',
    author: 'OpenCord',
    role: 'System',
    time: '08:00',
    body: 'Channel permissions are enabled. Members can view announcements but cannot send messages here.',
    own: false,
    embeds: [],
    attachments: [],
  },
]

const members: Member[] = [
  { id: 'u1', name: 'Thanet', role: 'Owners', presence: 'online' },
  { id: 'u2', name: 'You', role: 'Maintainers', presence: 'online' },
  { id: 'u3', name: 'Mira', role: 'Product', presence: 'idle' },
  { id: 'u4', name: 'Alex', role: 'Engineering', presence: 'online' },
  { id: 'u5', name: 'Nok', role: 'Engineering', presence: 'offline' },
]

const initialVoiceState: VoiceState = {
  connectedChannelId: 'standup',
  mediaReady: false,
  selfMute: false,
  selfDeaf: false,
  participants: [
    { id: 'u1', channelId: 'standup', name: 'Thanet', status: 'speaking' },
    { id: 'u2', channelId: 'standup', name: 'You', status: 'connected', self: true },
    { id: 'u3', channelId: 'standup', name: 'Mira', status: 'muted' },
    { id: 'u4', channelId: 'office-hours', name: 'Alex', status: 'connected' },
  ],
}

const initialMeetings: CalendarMeeting[] = [
  {
    id: 'meeting-roadmap-review',
    title: 'Roadmap Review',
    startsAt: '2026-06-24T09:00',
    endsAt: '2026-06-24T09:30',
    channelId: 'general',
    organizer: 'Mira',
    joinUrl: 'http://localhost:8080/join/mtg-roadmap-review',
    status: 'scheduled',
  },
  {
    id: 'meeting-office-hours',
    title: 'Office Hours',
    startsAt: '2026-06-24T13:00',
    endsAt: '2026-06-24T14:00',
    channelId: 'office-hours',
    organizer: 'Thanet',
    joinUrl: 'http://localhost:8080/join/mtg-office-hours',
    status: 'scheduled',
  },
]

const developerPermissionOptions: DeveloperPermissionOption[] = [
  { id: 'read_messages', label: 'Read messages' },
  { id: 'send_messages', label: 'Send messages' },
  { id: 'use_slash_commands', label: 'Use slash commands' },
  { id: 'manage_webhooks', label: 'Manage webhooks' },
]

const defaultDeveloperPermissionIds: DeveloperPermissionId[] = [
  'read_messages',
  'send_messages',
  'use_slash_commands',
]

const localAlphaSessionStorageKey = 'opencord.localAlphaSession:v1'

function meetingRoomStateFor(meetingId: string | undefined): MeetingRoomState {
  const meeting = initialMeetings.find((candidate) => candidate.id === meetingId) ?? initialMeetings[0]
  return meetingRoomStateForMeeting(meeting)
}

function meetingRoomStateForMeeting(meeting: CalendarMeeting): MeetingRoomState {
  const participants: MeetingRoomParticipant[] = [
    { id: 'self', name: 'You', role: 'You', self: true },
  ]
  if (meeting.organizer !== 'You') {
    participants.push({
      id: `organizer-${meeting.organizer}`,
      name: meeting.organizer,
      role: 'Organizer',
    })
  }

  return {
    meeting,
    mediaStatus: 'connected',
    selfMute: false,
    cameraOff: false,
    participants,
  }
}

type WorkspaceShellProps = {
  initialMeetingId?: string
  initialPanel?: ActivePanel
  initialSettingsPanel?: OpenCordSettingsPanel
}

export function WorkspaceShell({
  initialMeetingId,
  initialPanel = 'chat',
  initialSettingsPanel,
}: WorkspaceShellProps) {
  const [serverConnections, setServerConnections] = useState(() =>
    loadBrowserServerConnectionState(),
  )
  const activeConnection =
    activeServerConnection(serverConnections) ??
    activeServerConnection(createDefaultServerConnectionState())!
  const [serverURL, setServerURL] = useState(activeConnection.baseUrl)
  const [serverDisplayName, setServerDisplayName] = useState('')
  const [health, setHealth] = useState<HealthState>({ status: 'checking' })
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeConnectionStatus>(INITIAL_REALTIME_STATUS)
  const [spaces, setSpaces] = useState(initialSpaces)
  const [channels, setChannels] = useState(initialChannels)
  const [messages, setMessages] = useState(initialMessages)
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialSpaces[0].id)
  const [selectedChannelId, setSelectedChannelId] = useState(initialChannels[0].id)
  const [composerText, setComposerText] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([])
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [showUserSettings, setShowUserSettings] = useState(false)
  const [desktopQuickSwitcherOpen, setDesktopQuickSwitcherOpen] = useState(false)
  const [desktopQuickSwitcherQuery, setDesktopQuickSwitcherQuery] = useState('')
  const [desktopCaptureRequest, setDesktopCaptureRequest] =
    useState<OpenCordDesktopCapturePickerRequest | null>(null)
  const [desktopLifecycleState, setDesktopLifecycleState] =
    useState<OpenCordDesktopLifecycleState>({
      backgroundRealtime: false,
      focused: true,
      visibility: 'visible',
    })
  const [activeUserSettingsPanel, setActiveUserSettingsPanel] =
    useState<OpenCordSettingsPanel>(initialSettingsPanel ?? 'voice-video')
  const [newChannelName, setNewChannelName] = useState('')
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null)
  const [voiceState, setVoiceState] = useState(initialVoiceState)
  const [screenShareState, setScreenShareState] = useState<ScreenShareState>({ status: 'idle' })
  const routeContext = useWorkspaceUiStore((state) => state.routeContext)
  const [activePanel, setActivePanel] = useState<ActivePanel>(initialPanel)
  const [meetings, setMeetings] = useState(initialMeetings)
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [newMeetingStartsAt, setNewMeetingStartsAt] = useState('2026-06-25T10:00')
  const [newMeetingEndsAt, setNewMeetingEndsAt] = useState('2026-06-25T10:30')
  const [localAlphaEmail, setLocalAlphaEmail] = useState('alpha@example.com')
  const [localAlphaDisplayName, setLocalAlphaDisplayName] = useState('Alpha User')
  const [localAlphaPassword, setLocalAlphaPassword] = useState('')
  const [localAlphaRememberDevice, setLocalAlphaRememberDevice] = useState(true)
  const [localAlphaRememberedSession, setLocalAlphaRememberedSession] = useState(false)
  const [localAlphaUser, setLocalAlphaUser] = useState<AuthUser | null>(null)
  const [localAlphaSessionToken, setLocalAlphaSessionToken] = useState('')
  const [localAlphaOrganization, setLocalAlphaOrganization] = useState<Organization | null>(null)
  const [localAlphaStatus, setLocalAlphaStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  )
  const [localAlphaError, setLocalAlphaError] = useState<string | null>(null)
  const [pendingVoiceReconnectChannelId, setPendingVoiceReconnectChannelId] = useState<
    string | null
  >(null)
  const [meetingRoom, setMeetingRoom] = useState<MeetingRoomState | null>(() =>
    initialPanel === 'meeting' ? meetingRoomStateFor(initialMeetingId) : null,
  )
  const [developerBots, setDeveloperBots] = useState<DeveloperBot[]>([])
  const [developerWebhooks, setDeveloperWebhooks] = useState<DeveloperWebhook[]>([])
  const [developerAuditEvents, setDeveloperAuditEvents] = useState<DeveloperAuditEvent[]>([])
  const [selectedDeveloperPermissionIds, setSelectedDeveloperPermissionIds] = useState<
    DeveloperPermissionId[]
  >(defaultDeveloperPermissionIds)
  const [developerSessionToken, setDeveloperSessionToken] = useState('')
  const [developerOrganizationId, setDeveloperOrganizationId] = useState('')
  const [developerSpaceId, setDeveloperSpaceId] = useState('')
  const [developerChannelId, setDeveloperChannelId] = useState('')
  const [developerError, setDeveloperError] = useState<string | null>(null)
  const [newBotName, setNewBotName] = useState('')
  const [newBotDescription, setNewBotDescription] = useState('')
  const [newWebhookName, setNewWebhookName] = useState('')
  const voiceSessionRef = useRef<LiveKitVoiceSession | null>(null)
  const meetingSessionRef = useRef<LiveKitVoiceSession | null>(null)
  const localAlphaUserRef = useRef<AuthUser | null>(null)
  const voiceStateRef = useRef(voiceState)
  const meetingRoomRef = useRef(meetingRoom)
  const desktopCommandHandlerRef = useRef<(command: OpenCordDesktopCommand) => void>(
    () => undefined,
  )
  const remoteAudioContainerRef = useRef<HTMLDivElement | null>(null)
  const remoteScreenShareContainerRef = useRef<HTMLElement | null>(null)
  const meetingRemoteAudioContainerRef = useRef<HTMLDivElement | null>(null)
  const meetingRemoteScreenShareContainerRef = useRef<HTMLElement | null>(null)

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]
  const visibleChannels = channels.filter((channel) => channel.spaceId === selectedSpace.id)
  const selectedChannel =
    visibleChannels.find((channel) => channel.id === selectedChannelId) ?? visibleChannels[0]
  const channelMessages = messages.filter((message) => message.channelId === selectedChannel.id)
  const groupedMembers = useMemo(() => groupMembersByRole(members), [])
  const desktopRuntime = getOpenCordDesktopRuntime()
  const desktopVoiceChannel =
    voiceState.connectedChannelId ?
      channels.find((channel) => channel.id === voiceState.connectedChannelId) :
      undefined
  const desktopClientState = useMemo<OpenCordDesktopClientState>(() => {
    const activeServer = {
      active: true,
      id: activeConnection.id,
      name: activeConnection.displayName,
      url: activeConnection.baseUrl,
    }

    return {
      activeChannel: selectedChannel
        ? {
            id: selectedChannel.id,
            kind: selectedChannel.kind,
            name: selectedChannel.name,
            spaceId: selectedChannel.spaceId,
          }
        : null,
      activeServer,
      activeSpace: selectedSpace
        ? {
            id: selectedSpace.id,
            name: selectedSpace.name,
          }
        : null,
      channels: channels.map((channel) => ({
        id: channel.id,
        kind: channel.kind,
        name: channel.name,
        spaceId: channel.spaceId,
      })),
      servers: serverConnections.connections.map((connection) => ({
        active: connection.id === activeConnection.id,
        id: connection.id,
        name: connection.displayName,
        url: connection.baseUrl,
      })),
      voice: {
        channelId: voiceState.connectedChannelId,
        channelName: desktopVoiceChannel
          ? displayOpenCordChannelName(desktopVoiceChannel.name)
          : null,
        connected: Boolean(desktopVoiceChannel),
        deafened: voiceState.selfDeaf,
        muted: voiceState.selfMute,
        screenSharing: screenShareState.status === 'sharing',
      },
    }
  }, [
    activeConnection.baseUrl,
    activeConnection.displayName,
    activeConnection.id,
    channels,
    desktopVoiceChannel,
    screenShareState.status,
    selectedChannel,
    selectedSpace,
    serverConnections.connections,
    voiceState.connectedChannelId,
    voiceState.selfDeaf,
    voiceState.selfMute,
  ])
  const realtimeURL = useMemo(
    () => safeRealtimeURL(activeConnection.baseUrl),
    [activeConnection.baseUrl],
  )

  async function checkServer(targetURL = activeConnection.baseUrl) {
    setHealth({ status: 'checking' })
    try {
      const result = await createOpenCordApiClient({ baseUrl: targetURL }).health()
      setHealth(result)
      return result
    } catch (error) {
      const result = {
        status: 'offline',
        message: error instanceof Error ? error.message : 'Unable to reach server',
      } satisfies ServerHealth
      setHealth(result)
      return result
    }
  }

  async function startLocalAlpha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const email = localAlphaEmail.trim()
    const displayName = localAlphaDisplayName.trim()
    const password = localAlphaPassword
    if (!email || !displayName || !password) {
      setLocalAlphaStatus('error')
      setLocalAlphaError('Email, display name, and password are required')
      return
    }

    setLocalAlphaStatus('loading')
    setLocalAlphaError(null)
    const rememberDevice = localAlphaRememberDevice
    try {
      const anonymousClient = createOpenCordApiClient({
        baseUrl: activeConnection.baseUrl,
        credentials: 'include',
      })
      const authResult = await registerOrLoginLocalAlpha(
        anonymousClient,
        email,
        displayName,
        password,
        rememberDevice,
      )
      if (rememberDevice) {
        await persistLocalAlphaDeviceSession(activeConnection.baseUrl, authResult)
      } else {
        clearLocalAlphaSession()
        await clearLocalAlphaDeviceSession(activeConnection.baseUrl)
      }
      const client = createOpenCordApiClient({
        baseUrl: activeConnection.baseUrl,
        sessionToken: authResult.session.token,
      })
      await loadLocalAlphaWorkspace({
        client,
        displayName,
        email,
        rememberedSession: rememberDevice,
        reconnectVoiceChannelId: null,
        sessionToken: authResult.session.token,
        user: authResult.user,
      })
    } catch (error) {
      setLocalAlphaStatus('error')
      setLocalAlphaError(error instanceof Error ? error.message : 'Unable to start local alpha')
    }
  }

  async function restoreLocalAlphaSession(snapshot: LocalAlphaSessionSnapshot) {
    setLocalAlphaStatus('loading')
    setLocalAlphaError(null)
    setLocalAlphaEmail(snapshot.email)
    setLocalAlphaDisplayName(snapshot.displayName)

    try {
      const authResult = await refreshLocalAlphaDeviceSession(snapshot.baseUrl)
      await persistLocalAlphaDeviceSession(snapshot.baseUrl, authResult)
      setLocalAlphaRememberDevice(true)
      const client = createOpenCordApiClient({
        baseUrl: snapshot.baseUrl,
        sessionToken: authResult.session.token,
      })
      await loadLocalAlphaWorkspace({
        client,
        displayName: authResult.user.displayName,
        email: authResult.user.email,
        rememberedSession: true,
        reconnectVoiceChannelId: snapshot.reconnectVoiceChannelId,
        sessionToken: authResult.session.token,
        user: authResult.user,
      })
    } catch (error) {
      clearLocalAlphaSession()
      void clearLocalAlphaDeviceSession(snapshot.baseUrl)
      setLocalAlphaStatus('idle')
      setLocalAlphaError(null)
    }
  }

  async function refreshLocalAlphaDeviceSession(baseUrl: string) {
    const desktopStores = desktopDeviceSessionStores()
    const storedSession = desktopStores
      ? await loadActiveDeviceSession(desktopStores, baseUrl)
      : null
    const client = createOpenCordApiClient({
      baseUrl,
      credentials: 'include',
    })

    return storedSession
      ? client.refreshSession({ refreshToken: storedSession.refreshToken })
      : client.refreshSession()
  }

  async function persistLocalAlphaDeviceSession(
    baseUrl: string,
    authResult: AuthResult,
  ) {
    const desktopStores = desktopDeviceSessionStores()
    if (!desktopStores || !authResult.session.refreshToken) {
      return
    }

    await persistDeviceSession(desktopStores, {
      accountEmail: authResult.user.email,
      displayName: authResult.user.displayName,
      refreshToken: authResult.session.refreshToken,
      serverUrl: baseUrl,
      userId: authResult.user.id,
    })
  }

  async function clearLocalAlphaDeviceSession(baseUrl: string) {
    const desktopStores = desktopDeviceSessionStores()
    if (!desktopStores) {
      return
    }

    await clearActiveDeviceSession(desktopStores, baseUrl)
  }

  async function loadLocalAlphaWorkspace({
    client,
    displayName,
    email,
    rememberedSession,
    reconnectVoiceChannelId,
    sessionToken,
    user,
  }: {
    client: ReturnType<typeof createOpenCordApiClient>
    displayName: string
    email: string
    rememberedSession: boolean
    reconnectVoiceChannelId: string | null
    sessionToken: string
    user: AuthUser
  }) {
    const workspace = await ensureLocalAlphaWorkspace(client, user)
    const [loadedMessages, loadedMeetings] = await Promise.all([
      client.listMessages(workspace.channel.id),
      client.listMeetings(workspace.organization.id),
    ])

    await voiceSessionRef.current?.disconnect()
    voiceSessionRef.current = null
    await meetingSessionRef.current?.disconnect()
    meetingSessionRef.current = null
    setVoiceState({
      connectedChannelId: null,
      mediaReady: false,
      selfMute: false,
      selfDeaf: false,
      participants: [],
    })
    if (rememberedSession) {
      saveLocalAlphaSession({
        baseUrl: activeConnection.baseUrl,
        displayName,
        email,
        organization: workspace.organization,
        reconnectVoiceChannelId,
        user,
      })
    } else {
      clearLocalAlphaSession()
    }

    setLocalAlphaUser(user)
    setLocalAlphaSessionToken(sessionToken)
    setLocalAlphaRememberedSession(rememberedSession)
    setLocalAlphaOrganization(workspace.organization)
    setSpaces([spaceFromApi(workspace.space)])
    setChannels(workspace.channels.map(channelFromApi))
    setMessages(loadedMessages.map((message) => chatMessageFromApi(message, user)))
    setMeetings(loadedMeetings.map(calendarMeetingFromApi))
    setSelectedSpaceId(workspace.space.id)
    setSelectedChannelId(workspace.channel.id)
    setDeveloperSessionToken(sessionToken)
    setDeveloperOrganizationId(workspace.organization.id)
    setDeveloperSpaceId(workspace.space.id)
    setDeveloperChannelId(workspace.channel.id)
    setPendingAttachments([])
    setMeetingRoom(null)
    setActivePanel('chat')
    setPendingVoiceReconnectChannelId(reconnectVoiceChannelId)
    setLocalAlphaStatus('ready')
  }

  function persistLocalAlphaSession(reconnectVoiceChannelId: string | null) {
    if (
      !localAlphaRememberedSession ||
      !localAlphaSessionToken ||
      !localAlphaUser ||
      !localAlphaOrganization
    ) {
      return
    }

    saveLocalAlphaSession({
      baseUrl: activeConnection.baseUrl,
      displayName: localAlphaUser.displayName,
      email: localAlphaUser.email,
      organization: localAlphaOrganization,
      reconnectVoiceChannelId,
      user: localAlphaUser,
    })
  }

  async function registerOrLoginLocalAlpha(
    client: ReturnType<typeof createOpenCordApiClient>,
    email: string,
    displayName: string,
    password: string,
    rememberDevice: boolean,
  ) {
    try {
      return await client.register({ email, displayName, password, rememberDevice })
    } catch (error) {
      if (error instanceof OpenCordApiError && error.status === 409) {
        return client.login({ email, password, rememberDevice })
      }
      throw error
    }
  }

  async function ensureLocalAlphaWorkspace(
    client: ReturnType<typeof createOpenCordApiClient>,
    user: AuthUser,
  ) {
    const workspaceName = localAlphaWorkspaceName(user.email)
    const organizations = await client.listOrganizations()
    const organization =
      organizations[0] ??
      (await client.createOrganization({ name: `${workspaceName} Org` })).organization

    const existingSpaces = await client.listSpaces(organization.id)
    const space =
      existingSpaces[0] ??
      (await client.createSpace(organization.id, { name: `${workspaceName} Space` })).space

    const existingChannels = await client.listChannels(space.id)
    const channels =
      existingChannels.length > 0
        ? existingChannels
        : [
            await client.createChannel(space.id, {
              name: 'general',
              topic: 'Local alpha chat',
            }),
          ]
    const channel =
      channels.find((candidate) => candidate.kind === 'text') ??
      channels[0] ??
      (await client.createChannel(space.id, {
        name: 'general',
        topic: 'Local alpha chat',
      }))

    return { organization, space, channel, channels }
  }

  useEffect(() => {
    void checkServer(activeConnection.baseUrl)
  }, [])

  useEffect(() => {
    setActivePanel(initialPanel)
    if (initialPanel === 'meeting') {
      setMeetingRoom(meetingRoomStateFor(initialMeetingId))
    } else {
      setMeetingRoom(null)
    }
  }, [initialMeetingId, initialPanel])

  useEffect(() => {
    if (!initialSettingsPanel) {
      return
    }

    setActiveUserSettingsPanel(initialSettingsPanel)
    setShowUserSettings(true)
  }, [initialSettingsPanel])

  useEffect(() => {
    saveBrowserServerConnectionState(serverConnections)
  }, [serverConnections])

  useEffect(() => {
    localAlphaUserRef.current = localAlphaUser
  }, [localAlphaUser])

  useEffect(() => {
    voiceStateRef.current = voiceState
  }, [voiceState])

  useEffect(() => {
    meetingRoomRef.current = meetingRoom
  }, [meetingRoom])

  useEffect(() => {
    const snapshot = loadLocalAlphaSession()
    if (!snapshot || snapshot.baseUrl !== activeConnection.baseUrl) {
      return
    }

    void restoreLocalAlphaSession(snapshot)
  }, [])

  useEffect(() => {
    if (!pendingVoiceReconnectChannelId || localAlphaStatus !== 'ready') {
      return
    }
    const channel = channels.find(
      (candidate) => candidate.id === pendingVoiceReconnectChannelId,
    )
    if (channel?.kind !== 'voice') {
      return
    }

    const channelId = pendingVoiceReconnectChannelId
    setPendingVoiceReconnectChannelId(null)
    void joinVoiceChannel(channelId)
  }, [channels, localAlphaStatus, pendingVoiceReconnectChannelId])

  useEffect(() => {
    if (!localAlphaSessionToken) {
      setRealtimeStatus(INITIAL_REALTIME_STATUS)
      return
    }

    const client = createOpenCordRealtimeClient({
      serverUrl: activeConnection.baseUrl,
      token: localAlphaSessionToken,
    })
    const unsubscribeStatus = client.onStatus(setRealtimeStatus)
    const unsubscribeEvent = client.onEvent((event) => handleRealtimeMediaEvent(event))
    client.connect()

    return () => {
      unsubscribeEvent()
      unsubscribeStatus()
      client.disconnect()
    }
  }, [activeConnection.baseUrl, localAlphaSessionToken])

  useEffect(() => {
    return () => {
      void voiceSessionRef.current?.disconnect()
      voiceSessionRef.current = null
      void meetingSessionRef.current?.disconnect()
      meetingSessionRef.current = null
    }
  }, [])

  desktopCommandHandlerRef.current = handleDesktopCommand

  useEffect(() => {
    void desktopRuntime?.desktopState?.update(desktopClientState)
  }, [desktopClientState, desktopRuntime])

  useEffect(() => {
    const unsubscribe = desktopRuntime?.desktopCommands?.onCommand((command) => {
      desktopCommandHandlerRef.current(command)
    })

    return () => {
      unsubscribe?.()
    }
  }, [desktopRuntime])

  useEffect(() => {
    const unsubscribe = desktopRuntime?.screenShare?.onPickerRequest((request) => {
      setDesktopCaptureRequest(request)
    })

    return () => {
      unsubscribe?.()
    }
  }, [desktopRuntime])

  useEffect(() => {
    const unsubscribe = desktopRuntime?.lifecycle?.onState((state) => {
      setDesktopLifecycleState(state)
    })

    return () => {
      unsubscribe?.()
    }
  }, [desktopRuntime])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const commandModifier = event.metaKey || event.ctrlKey
      if (!commandModifier) {
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'k' && !event.shiftKey) {
        event.preventDefault()
        desktopCommandHandlerRef.current({ kind: 'show-channel-search' })
        return
      }

      if (!event.shiftKey) {
        return
      }

      switch (key) {
        case 'm':
          event.preventDefault()
          desktopCommandHandlerRef.current({ kind: 'voice-toggle-mute' })
          return
        case 'd':
          event.preventDefault()
          desktopCommandHandlerRef.current({ kind: 'voice-toggle-deafen' })
          return
        case 'l':
          event.preventDefault()
          desktopCommandHandlerRef.current({ kind: 'voice-leave' })
          return
        case 's':
          event.preventDefault()
          desktopCommandHandlerRef.current({ kind: 'screen-share-toggle' })
          return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  async function submitServer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const targetURL = serverURL
    const result = await checkServer(targetURL)
    setServerConnections((current) =>
      upsertServerConnection(current, {
        baseUrl: targetURL,
        displayName: serverDisplayName,
        serverVersion: result.status === 'online' ? result.version : 'unknown',
      }),
    )
    setServerDisplayName('')
  }

  function selectServerConnection(connection: ServerConnection) {
    setServerConnections((current) => switchServerConnection(current, connection.id))
    setServerURL(connection.baseUrl)
    setServerDisplayName('')
    void checkServer(connection.baseUrl)
  }

  function deleteServerConnection(connection: ServerConnection) {
    const next = removeServerConnection(serverConnections, connection.id)
    const nextActive = activeServerConnection(next)
    setServerConnections(next)
    if (nextActive) {
      setServerURL(nextActive.baseUrl)
      void checkServer(nextActive.baseUrl)
    }
  }

  function selectSpace(spaceId: string) {
    setSelectedSpaceId(spaceId)
    const firstChannel = channels.find((channel) => channel.spaceId === spaceId)
    if (firstChannel) {
      setSelectedChannelId(firstChannel.id)
      setPendingAttachments([])
      setMeetingRoom(null)
      setActivePanel('chat')
    }
  }

  function selectTextChannel(channelId: string) {
    setSelectedChannelId(channelId)
    setMeetingRoom(null)
    setActivePanel('chat')
  }

  function selectChannelFromDesktopCommand(channelId: string) {
    const channel = channels.find((candidate) => candidate.id === channelId)
    if (!channel) {
      return
    }

    setSelectedSpaceId(channel.spaceId)
    if (channel.kind === 'voice') {
      void joinVoiceChannel(channel.id)
      return
    }

    selectTextChannel(channel.id)
  }

  function selectChannelFromDesktopQuickSwitcher(channel: Channel) {
    setDesktopQuickSwitcherOpen(false)
    setDesktopQuickSwitcherQuery('')
    selectChannelFromDesktopCommand(channel.id)
  }

  function showChatPanel() {
    setMeetingRoom(null)
    setActivePanel('chat')
  }

  function showCalendarPanel() {
    setActivePanel('calendar')
  }

  function showDeveloperPanel() {
    setMeetingRoom(null)
    setActivePanel('developers')
  }

  function developerApiContext() {
    const sessionToken = developerSessionToken.trim()
    const organizationId = developerOrganizationId.trim()
    if (!sessionToken || !organizationId) {
      return null
    }

    return {
      client: createOpenCordApiClient({
        baseUrl: activeConnection.baseUrl,
        sessionToken,
      }),
      organizationId,
    }
  }

  function developerWebhookContext() {
    const sessionToken = developerSessionToken.trim()
    const channelId = developerChannelId.trim()
    if (!sessionToken || !channelId) {
      return null
    }

    return {
      client: createOpenCordApiClient({
        baseUrl: activeConnection.baseUrl,
        sessionToken,
      }),
      channelId,
    }
  }

  function appendDeveloperAuditEvent(event: Omit<DeveloperAuditEvent, 'id' | 'time'>) {
    setDeveloperAuditEvents((current) => [
      {
        ...event,
        id: `developer-audit-${Date.now()}-${current.length}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
      ...current,
    ])
  }

  function toggleDeveloperPermission(permissionId: DeveloperPermissionId) {
    setSelectedDeveloperPermissionIds((current) =>
      current.includes(permissionId)
        ? current.filter((candidate) => candidate !== permissionId)
        : [...current, permissionId],
    )
  }

  async function createDeveloperBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newBotName.trim()
    if (!name) {
      return
    }
    const description = newBotDescription.trim()
    const permissions = selectedDeveloperPermissionIds

    setDeveloperError(null)
    const context = developerApiContext()
    if (context) {
      try {
        const created = await context.client.createBotApplication(context.organizationId, {
          name,
          description: description || undefined,
        })
        setDeveloperBots((current) => [
          ...current,
          {
            id: created.botApplication.id,
            organizationId: created.botApplication.organizationId,
            botUserId: created.botApplication.botUserId,
            name: created.botApplication.name,
            description: created.botApplication.description || 'No description',
            token: created.botToken.token,
            permissions,
            invitedSpaceIds: [],
            serverManaged: true,
          },
        ])
        appendDeveloperAuditEvent({
          type: 'bot.created',
          target: created.botApplication.name,
          detail: developerPermissionSummary(permissions),
        })
        setNewBotName('')
        setNewBotDescription('')
      } catch (error) {
        setDeveloperError(error instanceof Error ? error.message : 'Unable to create bot')
      }
      return
    }

    setDeveloperBots((current) => [
      ...current,
      {
        id: createLocalBotId(name),
        name,
        description: description || 'No description',
        token: createLocalBotToken(),
        permissions,
        invitedSpaceIds: [],
      },
    ])
    appendDeveloperAuditEvent({
      type: 'bot.created',
      target: name,
      detail: developerPermissionSummary(permissions),
    })
    setNewBotName('')
    setNewBotDescription('')
  }

  async function createDeveloperWebhook(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newWebhookName.trim()
    if (!name) {
      return
    }

    setDeveloperError(null)
    const context = developerWebhookContext()
    if (developerSessionToken.trim() && !context) {
      setDeveloperError('Session token and webhook channel ID are required')
      return
    }

    if (context) {
      try {
        const created = await context.client.createIncomingWebhook(context.channelId, { name })
        setDeveloperWebhooks((current) => [
          ...current.filter((webhook) => webhook.id !== created.id),
          developerWebhookFromShownToken(created),
        ])
        appendDeveloperAuditEvent({
          type: 'webhook.created',
          target: created.name,
          detail: `Channel ${created.channelId} · token last 4 ${created.tokenLastFour}`,
        })
        setNewWebhookName('')
      } catch (error) {
        setDeveloperError(error instanceof Error ? error.message : 'Unable to create webhook')
      }
      return
    }

    const id = createLocalWebhookId(name)
    const token = createLocalWebhookToken()
    setDeveloperWebhooks((current) => [
      ...current,
      {
        id,
        channelId: selectedChannel.id,
        name,
        token,
        tokenLastFour: token.slice(-4),
        executeUrl: webhookExecuteURL(activeConnection.baseUrl, id, token),
      },
    ])
    appendDeveloperAuditEvent({
      type: 'webhook.created',
      target: name,
      detail: `Channel ${selectedChannel.id} · token last 4 ${token.slice(-4)}`,
    })
    setNewWebhookName('')
  }

  async function loadDeveloperWebhooksFromServer() {
    setDeveloperError(null)
    const context = developerWebhookContext()
    if (!context) {
      setDeveloperError('Session token and webhook channel ID are required')
      return
    }

    try {
      const webhooks = await context.client.listIncomingWebhooks(context.channelId)
      setDeveloperWebhooks(webhooks.map(developerWebhookFromDetail))
      webhooks.forEach((webhook) => {
        appendDeveloperAuditEvent({
          type: 'webhook.loaded',
          target: webhook.name,
          detail: `Channel ${webhook.channelId} · token last 4 ${webhook.tokenLastFour}`,
        })
      })
    } catch (error) {
      setDeveloperError(error instanceof Error ? error.message : 'Unable to load webhooks')
    }
  }

  async function rotateDeveloperWebhookToken(webhookId: string) {
    setDeveloperError(null)
    const webhook = developerWebhooks.find((candidate) => candidate.id === webhookId)
    const context = developerWebhookContext()
    if (webhook?.serverManaged) {
      if (!context) {
        setDeveloperError('Session token and webhook channel ID are required')
        return
      }

      try {
        const rotated = await context.client.rotateIncomingWebhookToken(context.channelId, webhook.id)
        setDeveloperWebhooks((current) =>
          current.map((candidate) =>
            candidate.id === webhookId ? developerWebhookFromShownToken(rotated) : candidate,
          ),
        )
        appendDeveloperAuditEvent({
          type: 'webhook.token_rotated',
          target: rotated.name,
          detail: `Channel ${rotated.channelId} · token last 4 ${rotated.tokenLastFour}`,
        })
      } catch (error) {
        setDeveloperError(error instanceof Error ? error.message : 'Unable to rotate webhook token')
      }
      return
    }

    const token = createLocalWebhookToken()
    setDeveloperWebhooks((current) =>
      current.map((candidate) =>
        candidate.id === webhookId
          ? {
              ...candidate,
              token,
              tokenLastFour: token.slice(-4),
              executeUrl: webhookExecuteURL(activeConnection.baseUrl, candidate.id, token),
            }
          : candidate,
      ),
    )
    if (webhook) {
      appendDeveloperAuditEvent({
        type: 'webhook.token_rotated',
        target: webhook.name,
        detail: `Channel ${webhook.channelId} · token last 4 ${token.slice(-4)}`,
      })
    }
  }

  async function deleteDeveloperWebhook(webhookId: string) {
    setDeveloperError(null)
    const webhook = developerWebhooks.find((candidate) => candidate.id === webhookId)
    const context = developerWebhookContext()
    if (webhook?.serverManaged) {
      if (!context) {
        setDeveloperError('Session token and webhook channel ID are required')
        return
      }

      try {
        await context.client.deleteIncomingWebhook(context.channelId, webhook.id)
      } catch (error) {
        setDeveloperError(error instanceof Error ? error.message : 'Unable to delete webhook')
        return
      }
    }

    setDeveloperWebhooks((current) => current.filter((candidate) => candidate.id !== webhookId))
    if (webhook) {
      appendDeveloperAuditEvent({
        type: 'webhook.deleted',
        target: webhook.name,
        detail: `Channel ${webhook.channelId}`,
      })
    }
  }

  async function loadDeveloperBotsFromServer() {
    setDeveloperError(null)
    const context = developerApiContext()
    if (!context) {
      setDeveloperError('Session token and organization ID are required')
      return
    }

    try {
      const details = await context.client.listBotApplications(context.organizationId)
      setDeveloperBots(
        details.map((detail) => ({
          id: detail.botApplication.id,
          organizationId: detail.botApplication.organizationId,
          botUserId: detail.botApplication.botUserId,
          name: detail.botApplication.name,
          description: detail.botApplication.description || 'No description',
          token: hiddenBotTokenLabel(detail.activeTokenLastFour),
          permissions: defaultDeveloperPermissionIds,
          invitedSpaceIds: detail.spaceMemberships.map((membership) => membership.spaceId),
          serverManaged: true,
        })),
      )
      details.forEach((detail) => {
        appendDeveloperAuditEvent({
          type: 'bot.loaded',
          target: detail.botApplication.name,
          detail: detail.activeTokenLastFour
            ? `Token last 4 ${detail.activeTokenLastFour}`
            : 'No active token',
        })
      })
    } catch (error) {
      setDeveloperError(error instanceof Error ? error.message : 'Unable to load bots')
    }
  }

  async function rotateDeveloperBotToken(botId: string) {
    setDeveloperError(null)
    const bot = developerBots.find((candidate) => candidate.id === botId)
    const context = developerApiContext()
    if (bot?.serverManaged && context && bot.organizationId) {
      try {
        const token = await context.client.rotateBotToken(bot.organizationId, bot.id)
        setDeveloperBots((current) =>
          current.map((candidate) =>
            candidate.id === botId ? { ...candidate, token: token.token } : candidate,
          ),
        )
        appendDeveloperAuditEvent({
          type: 'bot.token_rotated',
          target: bot.name,
          detail: `Token last 4 ${token.tokenLastFour}`,
        })
      } catch (error) {
        setDeveloperError(error instanceof Error ? error.message : 'Unable to rotate token')
      }
      return
    }

    const token = createLocalBotToken()
    setDeveloperBots((current) =>
      current.map((bot) =>
        bot.id === botId ? { ...bot, token } : bot,
      ),
    )
    if (bot) {
      appendDeveloperAuditEvent({
        type: 'bot.token_rotated',
        target: bot.name,
        detail: `Token last 4 ${token.slice(-4)}`,
      })
    }
  }

  async function inviteDeveloperBotToCurrentSpace(botId: string) {
    setDeveloperError(null)
    const bot = developerBots.find((candidate) => candidate.id === botId)
    const context = developerApiContext()
    const targetSpaceId = developerSpaceId.trim() || selectedSpace.id
    if (bot?.serverManaged && context && bot.organizationId) {
      try {
        const invite = await context.client.inviteBotApplicationToSpace(
          bot.organizationId,
          bot.id,
          targetSpaceId,
          { role: 'member' },
        )
        setDeveloperBots((current) =>
          current.map((candidate) => {
            if (
              candidate.id !== botId ||
              candidate.invitedSpaceIds.includes(invite.member.spaceId)
            ) {
              return candidate
            }

            return {
              ...candidate,
              botUserId: invite.botApplication.botUserId,
              invitedSpaceIds: [...candidate.invitedSpaceIds, invite.member.spaceId],
            }
          }),
        )
        appendDeveloperAuditEvent({
          type: 'bot.invited_to_space',
          target: bot.name,
          detail: `Space ${invite.member.spaceId} · role ${invite.member.role}`,
        })
      } catch (error) {
        setDeveloperError(error instanceof Error ? error.message : 'Unable to invite bot')
      }
      return
    }

    setDeveloperBots((current) =>
      current.map((bot) => {
        if (bot.id !== botId || bot.invitedSpaceIds.includes(selectedSpace.id)) {
          return bot
        }

        return { ...bot, invitedSpaceIds: [...bot.invitedSpaceIds, selectedSpace.id] }
      }),
    )
    if (bot && !bot.invitedSpaceIds.includes(selectedSpace.id)) {
      appendDeveloperAuditEvent({
        type: 'bot.invited_to_space',
        target: bot.name,
        detail: `Space ${selectedSpace.name} · role member`,
      })
    }
  }

  async function addChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = normalizeOpenCordChannelName(newChannelName)
    if (!name) {
      return
    }

    if (localAlphaSessionToken) {
      try {
        const client = createOpenCordApiClient({
          baseUrl: activeConnection.baseUrl,
          sessionToken: localAlphaSessionToken,
        })
        const created = await client.createChannel(selectedSpace.id, {
          name,
          topic: 'Local alpha channel',
        })
        const channel = channelFromApi(created)
        setChannels((current) => [...current, channel])
        setSelectedChannelId(channel.id)
        setNewChannelName('')
        setShowChannelForm(false)
        setPendingAttachments([])
        return
      } catch (error) {
        setLocalAlphaError(error instanceof Error ? error.message : 'Unable to create channel')
        setLocalAlphaStatus('error')
        return
      }
    }

    const id = `${name}-${Date.now()}`
    const channel: Channel = {
      id,
      spaceId: selectedSpace.id,
      kind: 'text',
      name,
      topic: 'New channel created locally. API persistence comes next.',
      category: 'Text channels',
      canSend: true,
      unread: false,
      private: false,
    }
    setChannels((current) => [...current, channel])
    setSelectedChannelId(channel.id)
    setNewChannelName('')
    setShowChannelForm(false)
  }

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = newMeetingTitle.trim()
    if (
      !title ||
      !newMeetingStartsAt ||
      !newMeetingEndsAt ||
      newMeetingEndsAt <= newMeetingStartsAt
    ) {
      return
    }

    if (localAlphaSessionToken && localAlphaOrganization) {
      try {
        const client = createOpenCordApiClient({
          baseUrl: activeConnection.baseUrl,
          sessionToken: localAlphaSessionToken,
        })
        const created = await client.createMeeting(localAlphaOrganization.id, {
          spaceId: selectedSpace.id,
          channelId: selectedChannel.id,
          title,
          startsAt: localDateTimeToIso(newMeetingStartsAt),
          endsAt: localDateTimeToIso(newMeetingEndsAt),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          reminders: [
            {
              recipientUserId: localAlphaUser?.id ?? null,
              channel: 'in_app',
              offsetMinutes: 10,
            },
          ],
        })
        setMeetings((current) =>
          [...current, calendarMeetingFromApi(created)].sort((left, right) =>
            left.startsAt.localeCompare(right.startsAt),
          ),
        )
        setNewMeetingTitle('')
        setNewMeetingStartsAt('2026-06-25T10:00')
        setNewMeetingEndsAt('2026-06-25T10:30')
        setShowMeetingForm(false)
        return
      } catch (error) {
        setLocalAlphaError(error instanceof Error ? error.message : 'Unable to create meeting')
        setLocalAlphaStatus('error')
        return
      }
    }

    const joinSlug = `local-${slugOpenCordTitle(title)}`
    const meeting: CalendarMeeting = {
      id: `${joinSlug}-${Date.now()}`,
      title,
      startsAt: newMeetingStartsAt,
      endsAt: newMeetingEndsAt,
      channelId: selectedChannel.id,
      organizer: 'You',
      joinUrl: `${activeConnection.baseUrl.replace(/\/+$/g, '')}/join/${joinSlug}`,
      status: 'scheduled',
    }

    setMeetings((current) =>
      [...current, meeting].sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    )
    setNewMeetingTitle('')
    setNewMeetingStartsAt('2026-06-25T10:00')
    setNewMeetingEndsAt('2026-06-25T10:30')
    setShowMeetingForm(false)
  }

  function cancelMeetingForm() {
    setNewMeetingTitle('')
    setNewMeetingStartsAt('2026-06-25T10:00')
    setNewMeetingEndsAt('2026-06-25T10:30')
    setShowMeetingForm(false)
  }

  async function joinMeetingRoom(meeting: CalendarMeeting) {
    await meetingSessionRef.current?.disconnect()
    meetingSessionRef.current = null

    const nextRoom = meetingRoomStateForMeeting(meeting)
    setMeetingRoom({
      ...nextRoom,
      mediaStatus:
        localAlphaSessionToken && isServerBackedId(meeting.id) ? 'connecting' : 'connected',
    })
    setActivePanel('meeting')

    if (!localAlphaSessionToken || !isServerBackedId(meeting.id)) {
      return
    }

    const client = createOpenCordApiClient({
      baseUrl: activeConnection.baseUrl,
      sessionToken: localAlphaSessionToken,
    })

    try {
      setLocalAlphaError(null)
      const media = await client.createMeetingMediaToken(meeting.id, {
        canPublishAudio: true,
        canPublishVideo: true,
        canPublishScreen: true,
        canSubscribe: true,
      })
      await voiceSessionRef.current?.disconnect()
      voiceSessionRef.current = null
      persistLocalAlphaSession(null)
      setVoiceState((current) => ({
        ...current,
        connectedChannelId: null,
        mediaReady: false,
        selfMute: false,
        selfDeaf: false,
        participants: current.participants.filter((participant) => !participant.self),
      }))

      const session = await connectLiveKitVoice({
        serverUrl: media.serverUrl,
        participantToken: media.participantToken,
        roomName: media.roomName,
        participantIdentity: media.participantIdentity,
        grants: media.grants,
        selfMute: nextRoom.selfMute,
        selfDeaf: false,
        rtcConfig: opencordMediaRtcConfig(),
        audioElementContainer: meetingRemoteAudioContainerRef.current,
        screenShareElementContainer: meetingRemoteScreenShareContainerRef.current,
        onStateChange: (mediaState) => {
          setMeetingRoom((current) =>
            current?.meeting.id === meeting.id
              ? mergeLiveKitMeetingState(current, mediaState)
              : current,
          )
        },
      })
      meetingSessionRef.current = session
      setMeetingRoom((current) =>
        current?.meeting.id === meeting.id ? { ...current, mediaStatus: 'connected' } : current,
      )
    } catch (error) {
      await meetingSessionRef.current?.disconnect()
      meetingSessionRef.current = null
      setLocalAlphaStatus('error')
      setLocalAlphaError(error instanceof Error ? error.message : 'Unable to join meeting media')
      setMeetingRoom((current) =>
        current?.meeting.id === meeting.id
          ? {
              ...current,
              mediaStatus: 'error',
              mediaError: error instanceof Error ? error.message : 'Unable to join meeting media',
            }
          : current,
      )
    }
  }

  function leaveMeetingRoom() {
    void meetingSessionRef.current?.disconnect()
    meetingSessionRef.current = null
    setScreenShareState((current) => {
      if (current.status === 'sharing') {
        stopScreenShareTracks(current.stream)
      }

      return { status: 'idle' }
    })
    setMeetingRoom(null)
    setActivePanel('calendar')
  }

  function toggleMeetingMute() {
    setMeetingRoom((current) => {
      if (!current) {
        return current
      }

      const selfMute = !current.selfMute
      void meetingSessionRef.current?.setMuted(selfMute)
      return { ...current, selfMute }
    })
  }

  function toggleMeetingCamera() {
    setMeetingRoom((current) =>
      current ? { ...current, cameraOff: !current.cameraOff } : current,
    )
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = composerText.trim()
    if ((!body && pendingAttachments.length === 0) || !selectedChannel.canSend) {
      return
    }

    if (localAlphaSessionToken) {
      try {
        const client = createOpenCordApiClient({
          baseUrl: activeConnection.baseUrl,
          sessionToken: localAlphaSessionToken,
        })
        const created = await client.createMessage(selectedChannel.id, {
          content: body,
          attachmentIds: [],
        })
        setMessages((current) => [
          ...current.filter((message) => message.id !== created.id),
          chatMessageFromApi(created, localAlphaUser),
        ])
        setComposerText('')
        setPendingAttachments([])
        return
      } catch (error) {
        setLocalAlphaError(error instanceof Error ? error.message : 'Unable to send message')
        setLocalAlphaStatus('error')
        return
      }
    }

    setMessages((current) => [
      ...current,
      {
        id: `local-${Date.now()}`,
        channelId: selectedChannel.id,
        author: 'You',
        role: 'Maintainer',
        time: 'now',
        body,
        own: true,
        embeds: [],
        attachments: pendingAttachments,
      },
    ])
    setComposerText('')
    setPendingAttachments([])
  }

  function attachFiles(files: FileList | null) {
    if (!files || !selectedChannel.canSend) {
      return
    }

    const attachments = Array.from(files).map((file) => ({
      id: `local-attachment-${Date.now()}-${file.name}`,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      previewUrl: imagePreviewUrl(file),
    }))
    setPendingAttachments((current) => [...current, ...attachments].slice(0, 10))
  }

  function removePendingAttachment(attachmentId: string) {
    setPendingAttachments((current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMessage) {
      return
    }

    const body = editingMessage.body.trim()
    if (!body) {
      return
    }

    if (localAlphaSessionToken && isServerBackedId(editingMessage.id)) {
      try {
        const client = createOpenCordApiClient({
          baseUrl: activeConnection.baseUrl,
          sessionToken: localAlphaSessionToken,
        })
        const updated = await client.updateMessage(editingMessage.id, { content: body })
        setMessages((current) =>
          current.map((message) =>
            message.id === editingMessage.id ? chatMessageFromApi(updated, localAlphaUser) : message,
          ),
        )
        setEditingMessage(null)
        return
      } catch (error) {
        setLocalAlphaError(error instanceof Error ? error.message : 'Unable to edit message')
        setLocalAlphaStatus('error')
        return
      }
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === editingMessage.id ? { ...message, body, edited: true } : message,
      ),
    )
    setEditingMessage(null)
  }

  async function deleteMessage(messageId: string) {
    if (localAlphaSessionToken && isServerBackedId(messageId)) {
      try {
        const client = createOpenCordApiClient({
          baseUrl: activeConnection.baseUrl,
          sessionToken: localAlphaSessionToken,
        })
        await client.deleteMessage(messageId)
      } catch (error) {
        setLocalAlphaError(error instanceof Error ? error.message : 'Unable to delete message')
        setLocalAlphaStatus('error')
        return
      }
    }

    setMessages((current) => current.filter((message) => message.id !== messageId))
  }

  async function joinVoiceChannel(channelId: string) {
    const channel = channels.find((candidate) => candidate.id === channelId)
    if (channel?.kind !== 'voice') {
      return
    }

    if (localAlphaSessionToken) {
      const selfMute = voiceState.selfMute
      const selfDeaf = voiceState.selfDeaf
      const client = createOpenCordApiClient({
        baseUrl: activeConnection.baseUrl,
        sessionToken: localAlphaSessionToken,
      })

      try {
        setLocalAlphaError(null)
        const joined = await client.joinVoiceChannel(channelId, {
          selfMute,
          selfDeaf,
        })
        await voiceSessionRef.current?.disconnect()
        voiceSessionRef.current = null

        const selfParticipant = voiceParticipantFromJoin(
          channelId,
          joined.voice.userId,
          localAlphaUser?.displayName ?? 'You',
          selfMute,
          selfDeaf,
        )

        setVoiceState((current) => ({
          ...current,
          connectedChannelId: channelId,
          mediaReady: false,
          selfMute,
          selfDeaf,
          participants: [
            ...current.participants.filter((participant) => !participant.self),
            selfParticipant,
          ],
        }))

        const session = await connectLiveKitVoice({
          serverUrl: joined.media.serverUrl,
          participantToken: joined.media.participantToken,
          roomName: joined.media.roomName,
          participantIdentity: joined.media.participantIdentity,
          grants: joined.media.grants,
          selfMute,
          selfDeaf,
          rtcConfig: opencordMediaRtcConfig(),
          audioElementContainer: remoteAudioContainerRef.current,
          screenShareElementContainer: remoteScreenShareContainerRef.current,
          onStateChange: (mediaState) => {
            setVoiceState((current) => mergeLiveKitVoiceState(current, channelId, mediaState))
          },
        })
        voiceSessionRef.current = session
        setVoiceState((current) =>
          current.connectedChannelId === channelId ? { ...current, mediaReady: true } : current,
        )
        persistLocalAlphaSession(channelId)
      } catch (error) {
        setLocalAlphaStatus('error')
        setLocalAlphaError(error instanceof Error ? error.message : 'Unable to join voice')
        await voiceSessionRef.current?.disconnect()
        voiceSessionRef.current = null
        setVoiceState((current) => ({
          ...current,
          connectedChannelId:
            current.connectedChannelId === channelId ? null : current.connectedChannelId,
          mediaReady: current.connectedChannelId === channelId ? false : current.mediaReady,
          participants: current.participants.filter(
            (participant) => !(participant.self && participant.channelId === channelId),
          ),
        }))
      }
      return
    }

    setVoiceState((current) => {
      const withoutSelf = current.participants.filter((participant) => !participant.self)

      return {
        ...current,
        connectedChannelId: channelId,
        mediaReady: false,
        participants: [
          ...withoutSelf,
          {
            id: 'u2',
            channelId,
            name: 'You',
            status: current.selfDeaf ? 'deafened' : current.selfMute ? 'muted' : 'connected',
            self: true,
          },
        ],
      }
    })
  }

  function disconnectVoice() {
    void voiceSessionRef.current?.disconnect()
    voiceSessionRef.current = null
    persistLocalAlphaSession(null)
    setScreenShareState((current) => {
      if (current.status === 'sharing') {
        stopScreenShareTracks(current.stream)
      }

      return { status: 'idle' }
    })
    setVoiceState((current) => ({
      ...current,
      connectedChannelId: null,
      mediaReady: false,
      selfMute: false,
      selfDeaf: false,
      participants: current.participants.filter((participant) => !participant.self),
    }))
  }

  function disconnectVoiceForPermissionChange(message: string) {
    void voiceSessionRef.current?.disconnect()
    voiceSessionRef.current = null
    persistLocalAlphaSession(null)
    setScreenShareState((current) => {
      if (current.status === 'sharing') {
        stopScreenShareTracks(current.stream)
      }

      return { status: 'idle' }
    })
    setVoiceState((current) => ({
      ...current,
      connectedChannelId: null,
      mediaReady: false,
      selfMute: false,
      selfDeaf: false,
      participants: current.participants.filter((participant) => !participant.self),
    }))
    setLocalAlphaStatus('ready')
    setLocalAlphaError(message)
  }

  function handleRealtimeMediaEvent(event: RealtimeIncomingEnvelope) {
    if (!isRealtimeEvent(event) || event.type !== 'media.permission_revoked') {
      return
    }

    const data = unknownRecord(event.data)
    const currentUser = localAlphaUserRef.current
    if (
      !data ||
      !currentUser ||
      data.target_kind !== 'member' ||
      data.target_id !== currentUser.id
    ) {
      return
    }

    const channelId =
      typeof data.channel_id === 'string' ? data.channel_id : event.scope.channel_id
    if (!channelId || voiceStateRef.current.connectedChannelId !== channelId) {
      return
    }

    const grants = unknownRecord(data.grants)
    if (data.action === 'disconnect' || grants?.can_subscribe === false) {
      disconnectVoiceForPermissionChange(
        'Voice access changed. You were removed from the channel.',
      )
      return
    }

    if (grants?.can_publish_audio === false) {
      void voiceSessionRef.current?.setMuted(true)
      setVoiceState((current) => ({
        ...current,
        selfMute: true,
        participants: current.participants.map((participant) =>
          participant.self
            ? {
                ...participant,
                status: current.selfDeaf ? 'deafened' : 'muted',
              }
            : participant,
        ),
      }))
      setLocalAlphaError('Voice permissions changed. Your microphone was muted.')
    }

    if (grants?.can_publish_screen === false) {
      void voiceSessionRef.current?.stopScreenShare()
      setScreenShareState((current) => {
        if (current.status === 'sharing') {
          stopScreenShareTracks(current.stream)
        }

        return { status: 'idle' }
      })
      setLocalAlphaError('Voice permissions changed. Screen sharing stopped.')
    }
  }

  function toggleSelfMute() {
    setVoiceState((current) => {
      const selfMute = !current.selfMute
      void voiceSessionRef.current?.setMuted(selfMute)

      return {
        ...current,
        selfMute,
        participants: current.participants.map((participant) =>
          participant.self
            ? {
                ...participant,
                status: current.selfDeaf ? 'deafened' : selfMute ? 'muted' : 'connected',
              }
            : participant,
        ),
      }
    })
  }

  async function startScreenShare() {
    if (
      (!meetingRoom && (!voiceState.connectedChannelId || !voiceState.mediaReady)) ||
      (meetingRoom && meetingRoom.mediaStatus !== 'connected') ||
      screenShareState.status === 'starting' ||
      screenShareState.status === 'sharing'
    ) {
      return
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setScreenShareState({ status: 'error', message: 'Screen share unavailable' })
      return
    }

    setScreenShareState({ status: 'starting' })
    let stream: MediaStream | null = null
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: true,
      })
      const [videoTrack] = stream.getVideoTracks()
      if (!videoTrack) {
        stopScreenShareTracks(stream)
        setScreenShareState({ status: 'error', message: 'Screen share unavailable' })
        return
      }

      videoTrack.addEventListener(
        'ended',
        () => {
          void (meetingRoom ? meetingSessionRef.current : voiceSessionRef.current)?.stopScreenShare()
          setScreenShareState({ status: 'idle' })
        },
        { once: true },
      )
      const mediaSession = meetingRoom ? meetingSessionRef.current : voiceSessionRef.current
      if (!mediaSession) {
        throw new Error('No active media session')
      }

      await mediaSession.publishScreenShare(stream)
      setScreenShareState({ status: 'sharing', stream })
    } catch (error) {
      if (stream) {
        stopScreenShareTracks(stream)
      }
      console.warn('OpenCord screen share failed', screenShareErrorDetails(error))
      setScreenShareState({ status: 'error', message: screenShareErrorMessage(error) })
    }
  }

  function stopScreenShare() {
    void (meetingRoom ? meetingSessionRef.current : voiceSessionRef.current)?.stopScreenShare()
    setScreenShareState((current) => {
      if (current.status === 'sharing') {
        stopScreenShareTracks(current.stream)
      }

      return { status: 'idle' }
    })
  }

  function toggleSelfDeaf() {
    setVoiceState((current) => {
      const selfDeaf = !current.selfDeaf
      void voiceSessionRef.current?.setDeafened(selfDeaf)

      return {
        ...current,
        selfDeaf,
        selfMute: selfDeaf ? true : current.selfMute,
        participants: current.participants.map((participant) =>
          participant.self
            ? {
                ...participant,
                status: selfDeaf ? 'deafened' : current.selfMute ? 'muted' : 'connected',
              }
            : participant,
        ),
      }
    })
  }

  function handleDesktopCommand(command: OpenCordDesktopCommand) {
    switch (command.kind) {
      case 'select-server': {
        const connection = serverConnections.connections.find(
          (candidate) => candidate.id === command.serverId,
        )
        if (connection) {
          selectServerConnection(connection)
        }
        return
      }
      case 'select-channel':
        selectChannelFromDesktopCommand(command.channelId)
        return
      case 'show-channel-search':
        setDesktopQuickSwitcherQuery('')
        setDesktopQuickSwitcherOpen(true)
        return
      case 'show-settings':
        setActiveUserSettingsPanel(command.panel)
        setShowUserSettings(true)
        return
      case 'voice-toggle-mute':
        if (voiceState.connectedChannelId) {
          toggleSelfMute()
        }
        return
      case 'voice-toggle-deafen':
        if (voiceState.connectedChannelId) {
          toggleSelfDeaf()
        }
        return
      case 'voice-leave':
        if (voiceState.connectedChannelId) {
          disconnectVoice()
        }
        return
      case 'screen-share-toggle':
        if (screenShareState.status === 'sharing') {
          stopScreenShare()
        } else {
          void startScreenShare()
        }
        return
    }
  }

  async function respondToDesktopCapturePicker(sourceId: string | null) {
    if (!desktopCaptureRequest) {
      return
    }

    const requestId = desktopCaptureRequest.requestId
    setDesktopCaptureRequest(null)
    const accepted = await desktopRuntime?.screenShare?.respond({ requestId, sourceId })
    if (accepted === false) {
      setScreenShareState({
        status: 'error',
        message: 'Screen share source expired. Try sharing again.',
      })
    }
  }

  return (
    <WorkspaceLayout routePanel={routeContext.panel}>
      <aside className="space-rail" aria-label="Space rail">
        <button className="home-button" type="button" aria-label="Home">
          OC
        </button>
        <div className="space-stack">
          {spaces.map((space) => (
            <button
              key={space.id}
              className={`space-button ${space.id === selectedSpace.id ? 'is-active' : ''}`}
              type="button"
              aria-label={space.name}
              onClick={() => selectSpace(space.id)}
            >
              <span>{space.initials}</span>
              {space.unread ? <i className="unread-dot" aria-hidden="true" /> : null}
              {space.mentions > 0 ? (
                <strong className="mention-badge" aria-label={`${space.mentions} mentions`}>
                  {space.mentions}
                </strong>
              ) : null}
            </button>
          ))}
        </div>
        <button className="rail-action" type="button" aria-label="Add space">
          +
        </button>
      </aside>

      <nav className="channel-sidebar" aria-label="Channel navigation">
        <div className="server-card">
          <div>
            <strong>{activeConnection.displayName}</strong>
            <span>{activeConnection.baseUrl}</span>
          </div>
          <StatusBadge health={health} />
        </div>

        <form className="server-form" onSubmit={submitServer}>
          <label htmlFor="server-display-name">Server display name</label>
          <input
            id="server-display-name"
            name="server-display-name"
            value={serverDisplayName}
            onChange={(event) => setServerDisplayName(event.target.value)}
            placeholder={activeConnection.displayName}
          />
          <label htmlFor="server-url">Server URL</label>
          <div>
            <input
              id="server-url"
              name="server-url"
              type="url"
              value={serverURL}
              onChange={(event) => setServerURL(event.target.value)}
            />
            <button type="submit" aria-label="Add server">
              Add
            </button>
          </div>
        </form>

        <form className="local-alpha-form" onSubmit={startLocalAlpha}>
          <label htmlFor="local-alpha-email">Local alpha email</label>
          <input
            id="local-alpha-email"
            type="email"
            value={localAlphaEmail}
            onChange={(event) => setLocalAlphaEmail(event.target.value)}
          />
          <label htmlFor="local-alpha-display-name">Local alpha display name</label>
          <input
            id="local-alpha-display-name"
            value={localAlphaDisplayName}
            onChange={(event) => setLocalAlphaDisplayName(event.target.value)}
          />
          <label htmlFor="local-alpha-password">Local alpha password</label>
          <input
            id="local-alpha-password"
            type="password"
            value={localAlphaPassword}
            onChange={(event) => setLocalAlphaPassword(event.target.value)}
          />
          <label className="remember-device-row">
            <input
              checked={localAlphaRememberDevice}
              onChange={(event) => setLocalAlphaRememberDevice(event.target.checked)}
              type="checkbox"
            />
            <span>Remember this device</span>
          </label>
          <button type="submit" disabled={localAlphaStatus === 'loading'}>
            {localAlphaStatus === 'loading' ? 'Starting' : 'Start local alpha'}
          </button>
          {localAlphaStatus === 'ready' && localAlphaUser ? (
            <div className="local-alpha-status">
              <strong>{localAlphaUser.displayName}</strong>
              <span>{localAlphaOrganization?.name ?? 'Local alpha ready'}</span>
            </div>
          ) : null}
          {localAlphaError ? (
            <div className="local-alpha-status is-error" role="alert">
              {localAlphaError}
            </div>
          ) : null}
        </form>

        <section className="server-connections" aria-label="Server connections">
          <h2>Servers</h2>
          {serverConnections.connections.map((connection) => (
            <div
              key={connection.id}
              className={`server-connection-row ${
                connection.id === activeConnection.id ? 'is-active' : ''
              }`}
            >
              <button
                type="button"
                aria-label={`Switch to ${connection.displayName}`}
                onClick={() => selectServerConnection(connection)}
              >
                <strong>{connection.displayName}</strong>
                <span>{connection.baseUrl}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${connection.displayName}`}
                onClick={() => deleteServerConnection(connection)}
              >
                Remove
              </button>
            </div>
          ))}
        </section>

        <button
          className="create-channel-button"
          type="button"
          onClick={() => setShowChannelForm((current) => !current)}
        >
          Create channel
        </button>

        {showChannelForm ? (
          <form className="channel-form" onSubmit={addChannel}>
            <label htmlFor="new-channel-name">New channel name</label>
            <div>
              <input
                id="new-channel-name"
                value={newChannelName}
                onChange={(event) => setNewChannelName(event.target.value)}
              />
              <button type="submit">Add channel</button>
            </div>
          </form>
        ) : null}

        <div className="channel-groups">
          {groupChannels(visibleChannels).map(([category, categoryChannels]) => (
            <section key={category} className="channel-group">
              <h2>{category}</h2>
              {categoryChannels.map((channel) => (
                <ChannelNavigationRow
                  key={channel.id}
                  channel={channel}
                  selectedChannelId={selectedChannel.id}
                  voiceState={voiceState}
                  onSelectTextChannel={selectTextChannel}
                  onJoinVoice={joinVoiceChannel}
                />
              ))}
            </section>
          ))}
        </div>

        <VoiceControls
          channels={channels}
          voiceState={voiceState}
          screenShareState={screenShareState}
          onToggleMute={toggleSelfMute}
          onToggleDeaf={toggleSelfDeaf}
          onDisconnect={disconnectVoice}
          onStartScreenShare={startScreenShare}
          onStopScreenShare={stopScreenShare}
        />
        <div ref={remoteAudioContainerRef} className="voice-audio-sink" aria-hidden="true" />
        <section
          ref={remoteScreenShareContainerRef}
          className="remote-screen-shares"
          aria-label="Remote screen shares"
        />

        <div className="user-footer">
          <div className="avatar">Y</div>
          <div>
            <strong>You</strong>
            <span>Online</span>
          </div>
          <button
            type="button"
            aria-expanded={showUserSettings}
            aria-label="User settings"
            onClick={() => setShowUserSettings((current) => !current)}
          >
            Set
          </button>
        </div>
        {showUserSettings ? (
          <UserSettingsPanel
            activePanel={activeUserSettingsPanel}
            desktopLifecycleState={desktopLifecycleState}
            desktopRuntime={desktopRuntime}
            onClose={() => setShowUserSettings(false)}
            onSelectPanel={setActiveUserSettingsPanel}
          />
        ) : null}
      </nav>

      <section className="chat-panel" aria-label="Selected channel">
        <header className="channel-header">
          <div>
            <h1># {selectedChannel.name}</h1>
            <p>{selectedChannel.topic}</p>
          </div>
          <div className="header-actions" aria-label="Channel tools">
            <button
              type="button"
              aria-pressed={activePanel === 'chat'}
              onClick={showChatPanel}
            >
              Chat
            </button>
            <button
              type="button"
              aria-pressed={activePanel === 'calendar'}
              onClick={showCalendarPanel}
            >
              Calendar
            </button>
            <button
              type="button"
              aria-pressed={activePanel === 'developers'}
              onClick={showDeveloperPanel}
            >
              Developer
            </button>
            <button type="button" aria-label="Toggle members">
              Panel
            </button>
          </div>
        </header>

        {activePanel === 'developers' ? (
          <DeveloperSettingsPanel
            activeConnection={activeConnection}
            auditEvents={developerAuditEvents}
            bots={developerBots}
            developerError={developerError}
            developerChannelId={developerChannelId}
            developerOrganizationId={developerOrganizationId}
            developerSessionToken={developerSessionToken}
            developerSpaceId={developerSpaceId}
            newBotDescription={newBotDescription}
            newBotName={newBotName}
            newWebhookName={newWebhookName}
            selectedChannel={selectedChannel}
            selectedPermissionIds={selectedDeveloperPermissionIds}
            selectedSpace={selectedSpace}
            webhooks={developerWebhooks}
            onCreateBot={createDeveloperBot}
            onCreateWebhook={createDeveloperWebhook}
            onDeleteWebhook={deleteDeveloperWebhook}
            onInviteBot={inviteDeveloperBotToCurrentSpace}
            onLoadBots={loadDeveloperBotsFromServer}
            onLoadWebhooks={loadDeveloperWebhooksFromServer}
            onDeveloperChannelIdChange={setDeveloperChannelId}
            onDeveloperOrganizationIdChange={setDeveloperOrganizationId}
            onDeveloperSessionTokenChange={setDeveloperSessionToken}
            onDeveloperSpaceIdChange={setDeveloperSpaceId}
            onNewBotDescriptionChange={setNewBotDescription}
            onNewBotNameChange={setNewBotName}
            onNewWebhookNameChange={setNewWebhookName}
            onRotateToken={rotateDeveloperBotToken}
            onRotateWebhookToken={rotateDeveloperWebhookToken}
            onTogglePermission={toggleDeveloperPermission}
          />
        ) : activePanel === 'calendar' ? (
          <CalendarPanel
            channels={channels}
            meetings={meetings}
            newMeetingEndsAt={newMeetingEndsAt}
            newMeetingStartsAt={newMeetingStartsAt}
            newMeetingTitle={newMeetingTitle}
            selectedChannel={selectedChannel}
            showMeetingForm={showMeetingForm}
            onCancelMeetingForm={cancelMeetingForm}
            onCreateMeeting={createMeeting}
            onNewMeetingEndsAtChange={setNewMeetingEndsAt}
            onNewMeetingStartsAtChange={setNewMeetingStartsAt}
            onNewMeetingTitleChange={setNewMeetingTitle}
            onJoinMeeting={joinMeetingRoom}
            onShowMeetingForm={() => setShowMeetingForm(true)}
          />
        ) : activePanel === 'meeting' && meetingRoom ? (
          <MeetingRoomPanel
            meetingRemoteAudioContainerRef={meetingRemoteAudioContainerRef}
            meetingRemoteScreenShareContainerRef={meetingRemoteScreenShareContainerRef}
            meetingRoom={meetingRoom}
            screenShareState={screenShareState}
            onLeave={leaveMeetingRoom}
            onStartScreenShare={startScreenShare}
            onStopScreenShare={stopScreenShare}
            onToggleCamera={toggleMeetingCamera}
            onToggleMute={toggleMeetingMute}
          />
        ) : (
          <>
            <section className="message-timeline" aria-label="Message timeline">
              {channelMessages.length === 0 ? (
                <div className="empty-state">No messages yet. Start the channel.</div>
              ) : (
                channelMessages.map((message) => (
                  <article key={message.id} className="message-card">
                    <div className="message-avatar" aria-hidden="true">
                      {initialsFor(message.author)}
                    </div>
                    <div className="message-body">
                      <header>
                        <strong>{message.author}</strong>
                        <span>{message.role}</span>
                        <time>{message.time}</time>
                        {message.edited ? <em>edited</em> : null}
                      </header>
                      {message.body ? <p>{message.body}</p> : null}
                      <RichEmbedList embeds={message.embeds} />
                      <AttachmentList attachments={message.attachments} />
                      {message.own ? (
                        <div className="message-actions">
                          <button
                            type="button"
                            aria-label="Edit message"
                            onClick={() =>
                              setEditingMessage({ id: message.id, body: message.body })
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label="Delete message"
                            onClick={() => deleteMessage(message.id)}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </section>

            {selectedChannel.canSend ? (
              <div className="typing-line" data-realtime-url={realtimeURL}>
                {composerText.trim() ? 'You are typing...' : realtimeStatusText(realtimeStatus)}
              </div>
            ) : (
              <div className="permission-banner">
                You can view this channel but cannot send messages.
              </div>
            )}

            {editingMessage ? (
              <form className="edit-bar" onSubmit={saveEdit}>
                <label htmlFor="edit-message-text">Edit message text</label>
                <input
                  id="edit-message-text"
                  value={editingMessage.body}
                  onChange={(event) =>
                    setEditingMessage((current) =>
                      current ? { ...current, body: event.target.value } : current,
                    )
                  }
                />
                <button type="submit">Save edit</button>
                <button type="button" onClick={() => setEditingMessage(null)}>
                  Cancel
                </button>
              </form>
            ) : null}

            <form className="composer" onSubmit={sendMessage}>
              {pendingAttachments.length > 0 ? (
                <div className="pending-attachments" aria-label="Pending attachments">
                  {pendingAttachments.map((attachment) => (
                    <div key={attachment.id} className="pending-attachment">
                      <AttachmentSummary attachment={attachment} />
                      <button
                        type="button"
                        aria-label={`Remove ${attachment.fileName}`}
                        onClick={() => removePendingAttachment(attachment.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <label className="attach-button" title="Attach file">
                <span aria-hidden="true">+</span>
                <input
                  aria-label="Attach file"
                  type="file"
                  multiple
                  disabled={!selectedChannel.canSend}
                  onChange={(event) => {
                    attachFiles(event.currentTarget.files)
                    event.currentTarget.value = ''
                  }}
                />
              </label>
              <textarea
                aria-label="Message composer"
                placeholder={`Message #${selectedChannel.name}`}
                value={composerText}
                disabled={!selectedChannel.canSend}
                onChange={(event) => setComposerText(event.target.value)}
              />
              <button
                type="submit"
                disabled={
                  !selectedChannel.canSend ||
                  (!composerText.trim() && pendingAttachments.length === 0)
                }
              >
                Send message
              </button>
            </form>
          </>
        )}
      </section>

      <aside className="members-panel" aria-label="Members">
        <header>
          <strong>Members</strong>
          <span>{members.filter((member) => member.presence !== 'offline').length} online</span>
        </header>
        {groupedMembers.map(([role, roleMembers]) => (
          <section key={role} className="member-group">
            <h2>{role}</h2>
            {roleMembers.map((member) => (
              <div key={member.id} className="member-row">
                <span className={`presence-dot is-${member.presence}`} aria-hidden="true" />
                <span>{member.name}</span>
              </div>
            ))}
          </section>
        ))}
      </aside>

      {desktopQuickSwitcherOpen ? (
        <DesktopQuickSwitcher
          channels={channels}
          query={desktopQuickSwitcherQuery}
          selectedChannelId={selectedChannel.id}
          onClose={() => setDesktopQuickSwitcherOpen(false)}
          onQueryChange={setDesktopQuickSwitcherQuery}
          onSelectChannel={selectChannelFromDesktopQuickSwitcher}
        />
      ) : null}
      {desktopCaptureRequest ? (
        <DesktopScreenSharePicker
          request={desktopCaptureRequest}
          onCancel={() => void respondToDesktopCapturePicker(null)}
          onSelectSource={(sourceId) => void respondToDesktopCapturePicker(sourceId)}
        />
      ) : null}
    </WorkspaceLayout>
  )
}

function DesktopScreenSharePicker({
  request,
  onCancel,
  onSelectSource,
}: {
  request: OpenCordDesktopCapturePickerRequest
  onCancel: () => void
  onSelectSource: (sourceId: string) => void
}) {
  const screenSources = request.sources.filter((source) => source.kind === 'screen')
  const windowSources = request.sources.filter((source) => source.kind === 'window')

  return (
    <div className="modal-backdrop desktop-capture-picker-backdrop">
      <section
        aria-label="Choose what to share"
        aria-modal="true"
        className="desktop-capture-picker"
        role="dialog"
      >
        <header>
          <div>
            <h2>Share screen</h2>
            <p>Choose one screen or window to publish to the current call.</p>
          </div>
          <button type="button" aria-label="Cancel screen share" onClick={onCancel}>
            Cancel
          </button>
        </header>
        <DesktopCaptureSourceGroup
          emptyLabel="No screens available"
          label="Screens"
          sources={screenSources}
          onSelectSource={onSelectSource}
        />
        <DesktopCaptureSourceGroup
          emptyLabel="No windows available"
          label="Windows"
          sources={windowSources}
          onSelectSource={onSelectSource}
        />
      </section>
    </div>
  )
}

function DesktopCaptureSourceGroup({
  emptyLabel,
  label,
  sources,
  onSelectSource,
}: {
  emptyLabel: string
  label: string
  sources: OpenCordDesktopCaptureSource[]
  onSelectSource: (sourceId: string) => void
}) {
  return (
    <section className="desktop-capture-source-group" aria-label={label}>
      <h3>{label}</h3>
      {sources.length === 0 ? (
        <p>{emptyLabel}</p>
      ) : (
        <div className="desktop-capture-source-grid">
          {sources.map((source) => (
            <button
              key={source.id}
              type="button"
              aria-label={`Share ${source.name}`}
              onClick={() => onSelectSource(source.id)}
            >
              <span className="desktop-capture-thumbnail">
                {source.thumbnailDataUrl ? (
                  <img src={source.thumbnailDataUrl} alt="" />
                ) : (
                  <span aria-hidden="true">{source.kind === 'screen' ? 'Screen' : 'Window'}</span>
                )}
              </span>
              <strong>{source.name}</strong>
              <em>{source.kind === 'screen' ? 'Screen' : 'Window'}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function DesktopQuickSwitcher({
  channels,
  query,
  selectedChannelId,
  onClose,
  onQueryChange,
  onSelectChannel,
}: {
  channels: Channel[]
  query: string
  selectedChannelId: string
  onClose: () => void
  onQueryChange: (value: string) => void
  onSelectChannel: (channel: Channel) => void
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredChannels = useMemo(
    () =>
      channels
        .filter((channel) =>
          normalizedQuery
            ? `${channel.name} ${channel.category}`.toLowerCase().includes(normalizedQuery)
            : true,
        )
        .slice(0, 12),
    [channels, normalizedQuery],
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className="modal-backdrop desktop-quick-switcher-backdrop" onClick={onClose}>
      <section
        aria-label="Quick channel search"
        aria-modal="true"
        className="desktop-quick-switcher"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Quick channel search</h2>
          <button type="button" aria-label="Close quick channel search" onClick={onClose}>
            Close
          </button>
        </header>
        <input
          ref={inputRef}
          aria-label="Search channels"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              onClose()
            }
          }}
          placeholder="Search channels"
        />
        <div className="desktop-quick-switcher-results" aria-label="Channel search results">
          {filteredChannels.length === 0 ? (
            <p>No matching channels</p>
          ) : (
            filteredChannels.map((channel) => (
              <button
                key={channel.id}
                aria-current={channel.id === selectedChannelId ? 'true' : undefined}
                type="button"
                onClick={() => onSelectChannel(channel)}
              >
                <span aria-hidden="true">{channel.kind === 'text' ? '#' : 'Voice'}</span>
                <strong>{channel.name}</strong>
                <em>{channel.category}</em>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function UserSettingsPanel({
  activePanel,
  desktopLifecycleState,
  desktopRuntime,
  onClose,
  onSelectPanel,
}: {
  activePanel: OpenCordSettingsPanel
  desktopLifecycleState: OpenCordDesktopLifecycleState
  desktopRuntime: OpenCordDesktopRuntime | null
  onClose: () => void
  onSelectPanel: (panel: OpenCordSettingsPanel) => void
}) {
  const isMacDesktop = desktopRuntime?.platform === 'darwin'
  const platformLabel = desktopRuntime
    ? desktopRuntime.platform === 'darwin'
      ? 'macOS desktop'
      : `${desktopRuntime.platform} desktop`
    : 'web browser'
  const visiblePanel = activePanel === 'notifications' ? 'notifications' : 'voice-video'
  const [notificationPermission, setNotificationPermission] =
    useState<WebNotificationPermissionState>(() => currentWebNotificationPermission())

  async function requestNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported')
      return
    }
    if (Notification.permission !== 'default') {
      setNotificationPermission(webNotificationPermissionFromBrowser(Notification.permission))
      return
    }

    const permission = await Notification.requestPermission()
    setNotificationPermission(webNotificationPermissionFromBrowser(permission))
  }

  return (
    <section
      className="user-settings-popover"
      aria-label={visiblePanel === 'notifications' ? 'Notification settings' : 'Voice & Video settings'}
    >
      <header>
        <div>
          <h2>{visiblePanel === 'notifications' ? 'Notifications' : 'Voice & Video'}</h2>
          <p>{platformLabel}</p>
        </div>
        <button type="button" aria-label="Close user settings" onClick={onClose}>
          Close
        </button>
      </header>
      <div className="settings-tab-row" role="tablist" aria-label="User settings sections">
        <button
          aria-selected={visiblePanel === 'voice-video'}
          onClick={() => onSelectPanel('voice-video')}
          role="tab"
          type="button"
        >
          Voice
        </button>
        <button
          aria-selected={visiblePanel === 'notifications'}
          onClick={() => onSelectPanel('notifications')}
          role="tab"
          type="button"
        >
          Notifications
        </button>
      </div>
      {visiblePanel === 'notifications' ? (
        <div className="device-permission-list">
          <DevicePermissionRow
            label="Browser notifications"
            status={webNotificationPermissionLabel(notificationPermission)}
            detail="Used for mentions, meeting reminders, and incoming call alerts while this client is running."
            action={
              notificationPermission === 'promptable' ? (
                <button type="button" onClick={requestNotifications}>
                  Grant
                </button>
              ) : null
            }
          />
          <DevicePermissionRow
            label="Notification tap routing"
            status={desktopRuntime ? 'Desktop ready' : 'Web ready'}
            detail={
              desktopRuntime
                ? 'Electron notification clicks route to the matching server, channel, message, or meeting.'
                : 'Web notification clicks use the same route target when a service worker/provider relay is configured.'
            }
          />
          <DevicePermissionRow
            label="Provider delivery"
            status="Not configured"
            detail="Production push delivery needs Web Push credentials plus APNs or FCM on native clients."
          />
        </div>
      ) : (
        <div className="device-permission-list">
          <DevicePermissionRow
            label="Microphone"
            status="Ask before join"
            detail="Used to publish your voice only while you are connected to a voice channel or meeting."
          />
          <DevicePermissionRow
            label="Screen share"
            status={isMacDesktop ? 'Requires macOS System Settings' : 'Ask before share'}
            detail={
              isMacDesktop
                ? 'Used only while sharing; macOS System Settings controls screen recording access for OpenCord.'
                : 'Used only while you publish a display track; browser access is requested for each share.'
            }
          />
          <DevicePermissionRow
            label="Speaker output"
            status="No publish access"
            detail="Used to play remote voice and meeting audio from other participants."
          />
          {desktopRuntime ? (
            <DevicePermissionRow
              label="Desktop background connection"
              status={
                desktopLifecycleState.backgroundRealtime
                  ? `Active while ${desktopLifecycleState.visibility}`
                  : 'Browser controlled'
              }
              detail="OpenCord keeps realtime and voice control state alive while the Electron window is hidden or minimized."
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

function DevicePermissionRow({
  action,
  detail,
  label,
  status,
}: {
  action?: ReactNode
  detail: string
  label: string
  status: string
}) {
  return (
    <article className="device-permission-row">
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
      <div className="device-permission-status">
        <span>{status}</span>
        {action}
      </div>
    </article>
  )
}

function DeveloperSettingsPanel({
  activeConnection,
  auditEvents,
  bots,
  developerError,
  developerChannelId,
  developerOrganizationId,
  developerSessionToken,
  developerSpaceId,
  newBotDescription,
  newBotName,
  newWebhookName,
  selectedChannel,
  selectedPermissionIds,
  selectedSpace,
  webhooks,
  onCreateBot,
  onCreateWebhook,
  onDeleteWebhook,
  onDeveloperChannelIdChange,
  onDeveloperOrganizationIdChange,
  onDeveloperSessionTokenChange,
  onDeveloperSpaceIdChange,
  onInviteBot,
  onLoadBots,
  onLoadWebhooks,
  onNewBotDescriptionChange,
  onNewBotNameChange,
  onNewWebhookNameChange,
  onRotateToken,
  onRotateWebhookToken,
  onTogglePermission,
}: {
  activeConnection: ServerConnection
  auditEvents: DeveloperAuditEvent[]
  bots: DeveloperBot[]
  developerError: string | null
  developerChannelId: string
  developerOrganizationId: string
  developerSessionToken: string
  developerSpaceId: string
  newBotDescription: string
  newBotName: string
  newWebhookName: string
  selectedChannel: Channel
  selectedPermissionIds: DeveloperPermissionId[]
  selectedSpace: Space
  webhooks: DeveloperWebhook[]
  onCreateBot: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onCreateWebhook: (event: FormEvent<HTMLFormElement>) => void | Promise<void>
  onDeleteWebhook: (webhookId: string) => void | Promise<void>
  onDeveloperChannelIdChange: (value: string) => void
  onDeveloperOrganizationIdChange: (value: string) => void
  onDeveloperSessionTokenChange: (value: string) => void
  onDeveloperSpaceIdChange: (value: string) => void
  onInviteBot: (botId: string) => void | Promise<void>
  onLoadBots: () => void | Promise<void>
  onLoadWebhooks: () => void | Promise<void>
  onNewBotDescriptionChange: (value: string) => void
  onNewBotNameChange: (value: string) => void
  onNewWebhookNameChange: (value: string) => void
  onRotateToken: (botId: string) => void | Promise<void>
  onRotateWebhookToken: (webhookId: string) => void | Promise<void>
  onTogglePermission: (permissionId: DeveloperPermissionId) => void
}) {
  const serverBaseURL = activeConnection.baseUrl.replace(/\/+$/g, '')
  const inviteTargetSpaceId = developerSpaceId.trim() || selectedSpace.id
  const botCountText = `${bots.length} bot ${
    bots.length === 1 ? 'application' : 'applications'
  }`
  const webhookCountText = `${webhooks.length} incoming ${
    webhooks.length === 1 ? 'webhook' : 'webhooks'
  }`

  return (
    <section className="developer-panel" aria-label="Developer settings">
      <div className="developer-toolbar">
        <div>
          <h2>Developer settings</h2>
          <p>
            {botCountText} · {webhookCountText}
          </p>
        </div>
        <div className="developer-toolbar-actions">
          <button type="button" onClick={onLoadBots}>
            Load server bots
          </button>
          <button type="button" onClick={onLoadWebhooks}>
            Load server webhooks
          </button>
        </div>
      </div>

      <div className="developer-form" aria-label="Developer server context">
        <div>
          <label htmlFor="developer-session-token">Session token</label>
          <input
            id="developer-session-token"
            type="password"
            value={developerSessionToken}
            onChange={(event) => onDeveloperSessionTokenChange(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="developer-organization-id">Organization ID</label>
          <input
            id="developer-organization-id"
            value={developerOrganizationId}
            onChange={(event) => onDeveloperOrganizationIdChange(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="developer-space-id">Space ID</label>
          <input
            id="developer-space-id"
            value={developerSpaceId}
            onChange={(event) => onDeveloperSpaceIdChange(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="developer-channel-id">Webhook channel ID</label>
          <input
            id="developer-channel-id"
            placeholder={selectedChannel.id}
            value={developerChannelId}
            onChange={(event) => onDeveloperChannelIdChange(event.target.value)}
          />
        </div>
      </div>

      {developerError ? (
        <div className="empty-state" role="alert">
          {developerError}
        </div>
      ) : null}

      <form className="developer-form" onSubmit={onCreateBot}>
        <div>
          <label htmlFor="bot-application-name">Bot application name</label>
          <input
            id="bot-application-name"
            value={newBotName}
            onChange={(event) => onNewBotNameChange(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="bot-application-description">Bot application description</label>
          <textarea
            id="bot-application-description"
            rows={3}
            value={newBotDescription}
            onChange={(event) => onNewBotDescriptionChange(event.target.value)}
          />
        </div>
        <fieldset className="developer-permission-picker">
          <legend>Bot permissions</legend>
          <div className="developer-permission-options">
            {developerPermissionOptions.map((permission) => (
              <label key={permission.id} className="developer-permission-option">
                <input
                  type="checkbox"
                  checked={selectedPermissionIds.includes(permission.id)}
                  onChange={() => onTogglePermission(permission.id)}
                />
                <span>{permission.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={!newBotName.trim()}>
          Create bot application
        </button>
      </form>

      <section className="developer-bot-list" aria-label="Bot applications">
        {bots.length === 0 ? (
          <div className="empty-state">No bot applications yet.</div>
        ) : (
          bots.map((bot) => {
            const isInvited = bot.invitedSpaceIds.includes(inviteTargetSpaceId)

            return (
              <article key={bot.id} className="developer-bot-card">
                <header>
                  <div>
                    <h3>{bot.name}</h3>
                    <p>{bot.description}</p>
                  </div>
                  <span>{isInvited ? `Invited to ${selectedSpace.name}` : 'Not invited'}</span>
                </header>

                <div className="developer-token-row">
                  <strong>Shown-once token</strong>
                  <code aria-label="Shown-once bot token">{bot.token}</code>
                </div>

                <div className="developer-permission-chips" aria-label={`${bot.name} permissions`}>
                  {bot.permissions.map((permission) => (
                    <span key={permission}>{developerPermissionLabel(permission)}</span>
                  ))}
                </div>

                <div className="developer-endpoints">
                  <div>
                    <strong>Server</strong>
                    <code>{serverBaseURL}</code>
                  </div>
                  <div>
                    <strong>REST</strong>
                    <code>/api/compat/discord/v10</code>
                  </div>
                  <div>
                    <strong>Gateway</strong>
                    <code>/api/compat/discord/gateway</code>
                  </div>
                </div>

                <div className="developer-bot-actions">
                  <button
                    type="button"
                    aria-label={`Rotate token for ${bot.name}`}
                    onClick={() => onRotateToken(bot.id)}
                  >
                    Rotate token
                  </button>
                  <button
                    type="button"
                    aria-label={`Invite ${bot.name} to ${selectedSpace.name}`}
                    disabled={isInvited}
                    onClick={() => onInviteBot(bot.id)}
                  >
                    {isInvited
                      ? `Invited to ${selectedSpace.name}`
                      : `Invite to ${selectedSpace.name}`}
                  </button>
                </div>
              </article>
            )
          })
        )}
      </section>

      <form className="developer-form" onSubmit={onCreateWebhook}>
        <div>
          <label htmlFor="incoming-webhook-name">Webhook name</label>
          <input
            id="incoming-webhook-name"
            value={newWebhookName}
            onChange={(event) => onNewWebhookNameChange(event.target.value)}
          />
        </div>
        <button type="submit" disabled={!newWebhookName.trim()}>
          Create incoming webhook
        </button>
      </form>

      <section className="developer-bot-list developer-webhook-list" aria-label="Incoming webhooks">
        {webhooks.length === 0 ? (
          <div className="empty-state">No incoming webhooks yet.</div>
        ) : (
          webhooks.map((webhook) => (
            <article key={webhook.id} className="developer-bot-card developer-webhook-card">
              <header>
                <div>
                  <h3>{webhook.name}</h3>
                  <p>Channel {webhook.channelId}</p>
                </div>
                <span>{webhook.serverManaged ? 'Server webhook' : 'Local webhook'}</span>
              </header>

              <div className="developer-token-row">
                <strong>Shown-once token</strong>
                <code aria-label="Shown-once webhook token">{webhook.token}</code>
              </div>

              <div className="developer-token-row">
                <strong>Execute URL</strong>
                <code aria-label="Incoming webhook execute URL">{webhook.executeUrl}</code>
              </div>

              <div className="developer-bot-actions">
                <button
                  type="button"
                  aria-label={`Rotate webhook token for ${webhook.name}`}
                  onClick={() => onRotateWebhookToken(webhook.id)}
                >
                  Rotate token
                </button>
                <button
                  type="button"
                  aria-label={`Delete webhook ${webhook.name}`}
                  onClick={() => onDeleteWebhook(webhook.id)}
                >
                  Delete webhook
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="developer-audit-list" aria-label="Developer audit events">
        {auditEvents.length === 0 ? (
          <div className="empty-state">No developer audit events yet.</div>
        ) : (
          auditEvents.map((event) => (
            <article key={event.id} className="developer-audit-card">
              <header>
                <code>{event.type}</code>
                <time>{event.time}</time>
              </header>
              <strong>{event.target}</strong>
              <p>{event.detail}</p>
            </article>
          ))
        )}
      </section>
    </section>
  )
}

function CalendarPanel({
  channels,
  meetings,
  newMeetingEndsAt,
  newMeetingStartsAt,
  newMeetingTitle,
  selectedChannel,
  showMeetingForm,
  onCancelMeetingForm,
  onCreateMeeting,
  onNewMeetingEndsAtChange,
  onNewMeetingStartsAtChange,
  onNewMeetingTitleChange,
  onJoinMeeting,
  onShowMeetingForm,
}: {
  channels: Channel[]
  meetings: CalendarMeeting[]
  newMeetingEndsAt: string
  newMeetingStartsAt: string
  newMeetingTitle: string
  selectedChannel: Channel
  showMeetingForm: boolean
  onCancelMeetingForm: () => void
  onCreateMeeting: (event: FormEvent<HTMLFormElement>) => void
  onNewMeetingEndsAtChange: (value: string) => void
  onNewMeetingStartsAtChange: (value: string) => void
  onNewMeetingTitleChange: (value: string) => void
  onJoinMeeting: (meeting: CalendarMeeting) => void
  onShowMeetingForm: () => void
}) {
  const scheduledMeetings = meetings.filter((meeting) => meeting.status === 'scheduled')

  return (
    <section className="calendar-panel" aria-label="Calendar">
      <div className="calendar-toolbar">
        <div>
          <h2>Calendar</h2>
          <p>{scheduledMeetings.length} scheduled meetings</p>
        </div>
        <button type="button" onClick={onShowMeetingForm}>
          New meeting
        </button>
      </div>

      <section className="meeting-list" aria-label="Upcoming meetings">
        {scheduledMeetings.map((meeting) => (
          <article key={meeting.id} className="meeting-card">
            <div className="meeting-card-time">
              <time dateTime={meeting.startsAt}>{formatOpenCordMeetingDay(meeting.startsAt)}</time>
              <span>{formatOpenCordMeetingClock(meeting.startsAt, meeting.endsAt)}</span>
            </div>
            <div className="meeting-card-body">
              <header>
                <h3>{meeting.title}</h3>
                <span>{openCordMeetingChannelLabel(meeting, channels)}</span>
              </header>
              <p>Organized by {meeting.organizer}</p>
              <div className="meeting-join">
                <strong>Join URL</strong>
                <code>{meeting.joinUrl}</code>
              </div>
              <div className="meeting-card-actions">
                <button
                  type="button"
                  aria-label={`Join meeting ${meeting.title}`}
                  onClick={() => onJoinMeeting(meeting)}
                >
                  Join meeting
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      {showMeetingForm ? (
        <div className="modal-backdrop">
          <section
            className="meeting-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-meeting-title"
          >
            <form onSubmit={onCreateMeeting}>
              <header>
                <h2 id="create-meeting-title">Create meeting</h2>
                <p>#{selectedChannel.name}</p>
              </header>
              <label htmlFor="meeting-title">Meeting title</label>
              <input
                id="meeting-title"
                value={newMeetingTitle}
                onChange={(event) => onNewMeetingTitleChange(event.target.value)}
              />
              <div className="meeting-form-grid">
                <div>
                  <label htmlFor="meeting-start">Start time</label>
                  <input
                    id="meeting-start"
                    type="datetime-local"
                    value={newMeetingStartsAt}
                    onChange={(event) => onNewMeetingStartsAtChange(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="meeting-end">End time</label>
                  <input
                    id="meeting-end"
                    type="datetime-local"
                    value={newMeetingEndsAt}
                    onChange={(event) => onNewMeetingEndsAtChange(event.target.value)}
                  />
                </div>
              </div>
              <div className="meeting-dialog-actions">
                <button type="button" onClick={onCancelMeetingForm}>
                  Cancel
                </button>
                <button type="submit">Create meeting</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  )
}

function MeetingRoomPanel({
  meetingRemoteAudioContainerRef,
  meetingRemoteScreenShareContainerRef,
  meetingRoom,
  screenShareState,
  onLeave,
  onStartScreenShare,
  onStopScreenShare,
  onToggleCamera,
  onToggleMute,
}: {
  meetingRemoteAudioContainerRef: RefObject<HTMLDivElement | null>
  meetingRemoteScreenShareContainerRef: RefObject<HTMLElement | null>
  meetingRoom: MeetingRoomState
  screenShareState: ScreenShareState
  onLeave: () => void
  onStartScreenShare: () => void
  onStopScreenShare: () => void
  onToggleCamera: () => void
  onToggleMute: () => void
}) {
  const screenShareButtonLabel =
    screenShareState.status === 'sharing' ? 'Stop meeting screen share' : 'Share meeting screen'

  return (
    <section className="meeting-room-panel" aria-label="Meeting room">
      <header className="meeting-room-header">
        <div>
          <h2>{meetingRoom.meeting.title}</h2>
          <p>
            {formatOpenCordMeetingDay(meetingRoom.meeting.startsAt)} ·{' '}
            {formatOpenCordMeetingClock(meetingRoom.meeting.startsAt, meetingRoom.meeting.endsAt)}
          </p>
        </div>
        <strong>{meetingMediaStatusLabel(meetingRoom)}</strong>
      </header>

      <div className="meeting-room-join">
        <span>Join URL</span>
        <code>{meetingRoom.meeting.joinUrl}</code>
      </div>

      <section
        ref={meetingRemoteScreenShareContainerRef}
        className="remote-screen-shares meeting-remote-screen-shares"
        aria-label="Meeting remote screen shares"
      />

      <section className="meeting-room-grid" aria-label="Meeting participants">
        {meetingRoom.participants.map((participant) => {
          const status = meetingParticipantStatus(participant, meetingRoom)

          return (
            <article
              key={participant.id}
              className={`meeting-participant-card is-${status.replace(/\s+/g, '-')}`}
              aria-label={`${participant.name} ${status}`}
            >
              <div className="meeting-participant-avatar">{initialsFor(participant.name)}</div>
              <strong>{participant.name}</strong>
              <span>{participant.role}</span>
              <em>{status}</em>
            </article>
          )
        })}
      </section>

      <div className="meeting-room-controls" aria-label="Meeting controls">
        <button
          type="button"
          aria-label={
            meetingRoom.selfMute ? 'Unmute meeting microphone' : 'Mute meeting microphone'
          }
          onClick={onToggleMute}
        >
          {meetingRoom.selfMute ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          aria-label={meetingRoom.cameraOff ? 'Turn camera on' : 'Turn camera off'}
          onClick={onToggleCamera}
        >
          {meetingRoom.cameraOff ? 'Camera on' : 'Camera off'}
        </button>
        <button
          type="button"
          aria-label={screenShareButtonLabel}
          disabled={meetingRoom.mediaStatus !== 'connected' || screenShareState.status === 'starting'}
          onClick={screenShareState.status === 'sharing' ? onStopScreenShare : onStartScreenShare}
        >
          {screenShareState.status === 'sharing'
            ? 'Stop share'
            : screenShareState.status === 'starting'
              ? 'Starting'
              : 'Share'}
        </button>
        <button type="button" aria-label="Leave meeting" onClick={onLeave}>
          Leave
        </button>
      </div>
      <MeetingScreenShareStatus state={screenShareState} />
      <div ref={meetingRemoteAudioContainerRef} className="voice-audio-sink" aria-hidden="true" />
    </section>
  )
}

function StatusBadge({ health }: { health: HealthState }) {
  if (health.status === 'checking') {
    return <div className="status-badge is-checking">Checking API</div>
  }

  if (health.status === 'online') {
    return (
      <div className="status-badge is-online">
        <span>API online</span>
        <strong>{health.version}</strong>
      </div>
    )
  }

  return (
    <div className="status-badge is-offline">
      <span>API offline</span>
      <strong>{health.message}</strong>
    </div>
  )
}

function ChannelNavigationRow({
  channel,
  selectedChannelId,
  voiceState,
  onSelectTextChannel,
  onJoinVoice,
}: {
  channel: Channel
  selectedChannelId: string
  voiceState: VoiceState
  onSelectTextChannel: (channelId: string) => void
  onJoinVoice: (channelId: string) => void
}) {
  if (channel.kind === 'voice') {
    const voiceChannelName = displayOpenCordChannelName(channel.name)
    const isConnected = voiceState.connectedChannelId === channel.id
    const participants = voiceParticipantsForChannel(voiceState, channel.id)

    return (
      <div className={`voice-channel-card ${isConnected ? 'is-connected' : ''}`}>
        <div className="voice-channel-header">
          <button
            className="voice-channel-button"
            type="button"
            aria-label={`Voice: ${voiceChannelName}`}
            onClick={() => onJoinVoice(channel.id)}
          >
            <span aria-hidden="true">V</span>
            <span>{voiceChannelName}</span>
          </button>
          <button
            className="voice-join-button"
            type="button"
            aria-label={`Join Voice: ${voiceChannelName}`}
            onClick={() => onJoinVoice(channel.id)}
          >
            {isConnected ? 'Joined' : 'Join'}
          </button>
        </div>
        {participants.length > 0 ? (
          <VoiceParticipantList
            participants={participants}
            voiceState={voiceState}
            current={isConnected}
          />
        ) : null}
      </div>
    )
  }

  return (
    <button
      className={`channel-row ${channel.id === selectedChannelId ? 'is-selected' : ''}`}
      type="button"
      aria-label={`# ${channel.name}`}
      onClick={() => onSelectTextChannel(channel.id)}
    >
      <span aria-hidden="true">#</span>
      <span>{channel.name}</span>
      {channel.unread ? <i aria-hidden="true" /> : null}
    </button>
  )
}

function VoiceParticipantList({
  participants,
  voiceState,
  current,
}: {
  participants: VoiceParticipant[]
  voiceState: VoiceState
  current: boolean
}) {
  return (
    <div
      className="voice-participants"
      aria-label={current ? 'Current voice participants' : undefined}
    >
      {participants.map((participant) => {
        const status = voiceParticipantStatus(participant, voiceState)

        return (
          <div
            key={participant.id}
            className={`voice-participant-row is-${status}`}
            aria-label={`${participant.name} ${status}`}
          >
            <span className="voice-user-avatar" aria-hidden="true">
              {initialsFor(participant.name)}
            </span>
            <span>{participant.name}</span>
            <em>{status}</em>
          </div>
        )
      })}
    </div>
  )
}

function VoiceControls({
  channels,
  voiceState,
  screenShareState,
  onToggleMute,
  onToggleDeaf,
  onDisconnect,
  onStartScreenShare,
  onStopScreenShare,
}: {
  channels: Channel[]
  voiceState: VoiceState
  screenShareState: ScreenShareState
  onToggleMute: () => void
  onToggleDeaf: () => void
  onDisconnect: () => void
  onStartScreenShare: () => void
  onStopScreenShare: () => void
}) {
  const activeChannel = channels.find((channel) => channel.id === voiceState.connectedChannelId)
  const isConnected = activeChannel?.kind === 'voice'
  const activeParticipants = isConnected
    ? voiceParticipantsForChannel(voiceState, activeChannel.id)
    : []
  const screenShareButtonLabel =
    screenShareState.status === 'sharing' ? 'Stop screen share' : 'Share screen'

  return (
    <section className="voice-controls" aria-label="Voice controls">
      <div className="voice-controls-status">
        <strong>{isConnected ? 'Voice connected' : 'Not connected'}</strong>
        <span>
          {isConnected ? displayOpenCordChannelName(activeChannel.name) : 'Join a voice channel'}
        </span>
        {activeParticipants.length > 0 ? (
          <span className="voice-controls-participants">
            {activeParticipants.map((participant) => participant.name).join(', ')}
          </span>
        ) : null}
        <ScreenShareStatus state={screenShareState} />
      </div>
      <div className="voice-control-buttons">
        <button
          type="button"
          aria-label={voiceState.selfMute ? 'Unmute microphone' : 'Mute microphone'}
          disabled={!isConnected}
          onClick={onToggleMute}
        >
          {voiceState.selfMute ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          aria-label={voiceState.selfDeaf ? 'Undeafen audio' : 'Deafen audio'}
          disabled={!isConnected}
          onClick={onToggleDeaf}
        >
          {voiceState.selfDeaf ? 'Undeaf' : 'Deaf'}
        </button>
        <button
          type="button"
          aria-label={screenShareButtonLabel}
          disabled={!isConnected || !voiceState.mediaReady || screenShareState.status === 'starting'}
          onClick={
            screenShareState.status === 'sharing' ? onStopScreenShare : onStartScreenShare
          }
        >
          {screenShareState.status === 'sharing'
            ? 'Stop'
            : screenShareState.status === 'starting'
              ? 'Starting'
              : 'Share'}
        </button>
        <button
          type="button"
          aria-label="Disconnect voice"
          disabled={!isConnected}
          onClick={onDisconnect}
        >
          Leave
        </button>
      </div>
    </section>
  )
}

function ScreenShareStatus({ state }: { state: ScreenShareState }) {
  switch (state.status) {
    case 'starting':
      return <span className="voice-controls-share">Starting screen share</span>
    case 'sharing':
      return <span className="voice-controls-share">Screen sharing</span>
    case 'error':
      return <span className="voice-controls-error">{state.message}</span>
    case 'idle':
      return null
  }
}

function MeetingScreenShareStatus({ state }: { state: ScreenShareState }) {
  switch (state.status) {
    case 'starting':
      return <p className="meeting-room-status">Starting screen share</p>
    case 'sharing':
      return <p className="meeting-room-status">Screen sharing</p>
    case 'error':
      return <p className="meeting-room-status is-error">{state.message}</p>
    case 'idle':
      return null
  }
}

function AttachmentList({ attachments }: { attachments: MessageAttachment[] }) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className="message-attachments">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="message-attachment">
          {attachment.previewUrl ? (
            <img src={attachment.previewUrl} alt="" className="attachment-preview" />
          ) : null}
          <AttachmentSummary attachment={attachment} />
        </div>
      ))}
    </div>
  )
}

function RichEmbedList({ embeds }: { embeds: RichEmbed[] }) {
  if (embeds.length === 0) {
    return null
  }

  return (
    <div className="message-embeds">
      {embeds.map((embed, index) => (
        <RichEmbedCard
          key={`${embed.title ?? embed.description ?? 'embed'}-${index}`}
          embed={embed}
        />
      ))}
    </div>
  )
}

function RichEmbedCard({ embed }: { embed: RichEmbed }) {
  const label = richEmbedLabel(embed)

  return (
    <article
      aria-label={`Rich embed: ${label}`}
      className="message-embed-card"
      style={{ borderLeftColor: richEmbedAccentColor(embed.color) }}
    >
      <div className="message-embed-main">
        {embed.author?.name ? (
          <div className="message-embed-author">
            {embed.author.icon_url ? <img src={embed.author.icon_url} alt="" /> : null}
            {embed.author.url ? (
              <a href={embed.author.url} target="_blank" rel="noreferrer">
                {embed.author.name}
              </a>
            ) : (
              <span>{embed.author.name}</span>
            )}
          </div>
        ) : null}
        {embed.title ? (
          embed.url ? (
            <a className="message-embed-title" href={embed.url} target="_blank" rel="noreferrer">
              {embed.title}
            </a>
          ) : (
            <strong className="message-embed-title">{embed.title}</strong>
          )
        ) : null}
        {embed.description ? (
          <p className="message-embed-description">{embed.description}</p>
        ) : null}
        {embed.fields && embed.fields.length > 0 ? (
          <dl className="message-embed-fields">
            {embed.fields.map((field, index) => (
              <div
                key={`${field.name}-${index}`}
                className={field.inline ? 'message-embed-field is-inline' : 'message-embed-field'}
              >
                <dt>{field.name}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {embed.image?.url ? (
          <img className="message-embed-image" src={embed.image.url} alt="" />
        ) : null}
        {embed.footer?.text || embed.timestamp ? (
          <footer className="message-embed-footer">
            {embed.footer?.icon_url ? <img src={embed.footer.icon_url} alt="" /> : null}
            {embed.footer?.text ? <span>{embed.footer.text}</span> : null}
            {embed.footer?.text && embed.timestamp ? <span aria-hidden="true">·</span> : null}
            {embed.timestamp ? <time>{formatEmbedTimestamp(embed.timestamp)}</time> : null}
          </footer>
        ) : null}
      </div>
      {embed.thumbnail?.url ? (
        <img className="message-embed-thumbnail" src={embed.thumbnail.url} alt="" />
      ) : null}
    </article>
  )
}

function AttachmentSummary({ attachment }: { attachment: MessageAttachment }) {
  return (
    <div className="attachment-summary">
      <strong>{attachment.fileName}</strong>
      <span className="attachment-meta">
        <span>{attachment.contentType}</span>
        <span>{formatBytes(attachment.sizeBytes)}</span>
      </span>
    </div>
  )
}

function spaceFromApi(space: ApiSpace): Space {
  const name = space.name || 'Local Alpha'

  return {
    id: space.id,
    name,
    initials: initialsFor(name),
    unread: false,
    mentions: 0,
  }
}

function channelFromApi(channel: ApiChannel): Channel {
  return {
    id: channel.id,
    spaceId: channel.spaceId,
    kind: channel.kind,
    name: channel.slug || normalizeOpenCordChannelName(channel.name) || channel.name,
    topic: channel.topic || 'Local alpha channel',
    category: channel.kind === 'voice' ? 'Voice channels' : 'Text channels',
    canSend: channel.kind === 'text',
    unread: false,
    private: channel.isPrivate,
  }
}

function chatMessageFromApi(message: ApiMessage, user: AuthUser | null): ChatMessage {
  const own = Boolean(user?.id && user.id === message.authorUserId)
  const timestamp = message.createdAt ? new Date(message.createdAt) : null
  const author = message.webhookUsername ?? (own ? 'You' : shortId(message.authorUserId))

  return {
    id: message.id,
    channelId: message.channelId,
    author,
    role: 'Member',
    time:
      timestamp && !Number.isNaN(timestamp.getTime())
        ? timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : 'now',
    body: message.content,
    own,
    embeds: message.embeds as RichEmbed[],
    attachments: message.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      previewUrl: attachment.contentType.startsWith('image/')
        ? attachment.downloadUrl || undefined
        : undefined,
    })),
    edited: Boolean(message.editedAt),
  }
}

function calendarMeetingFromApi(meeting: ApiMeeting): CalendarMeeting {
  return {
    id: meeting.id,
    title: meeting.title,
    startsAt: meeting.startsAt,
    endsAt: meeting.endsAt,
    channelId: meeting.channelId ?? '',
    organizer: 'You',
    joinUrl: meeting.joinUrl,
    status: meeting.status === 'cancelled' ? 'cancelled' : 'scheduled',
  }
}

function localDateTimeToIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

function isServerBackedId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function localAlphaWorkspaceName(email: string) {
  const localPart = email
    .split('@')[0]
    ?.replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return `Alpha ${localPart || 'User'}`
}

function shortId(value: string) {
  return value ? value.slice(0, 8) : 'OpenCord'
}

function groupChannels(channels: Channel[]) {
  return Array.from(
    channels.reduce((groups, channel) => {
      groups.set(channel.category, [...(groups.get(channel.category) ?? []), channel])
      return groups
    }, new Map<string, Channel[]>()),
  )
}

function groupMembersByRole(memberList: Member[]) {
  return Array.from(
    memberList.reduce((groups, member) => {
      groups.set(member.role, [...(groups.get(member.role) ?? []), member])
      return groups
    }, new Map<string, Member[]>()),
  )
}

function voiceParticipantsForChannel(voiceState: VoiceState, channelId: string) {
  return voiceState.participants.filter((participant) => {
    if (!participant.self) {
      return participant.channelId === channelId
    }

    return voiceState.connectedChannelId === channelId && participant.channelId === channelId
  })
}

function voiceParticipantFromJoin(
  channelId: string,
  userId: string,
  name: string,
  selfMute: boolean,
  selfDeaf: boolean,
): VoiceParticipant {
  return {
    id: userId,
    channelId,
    name,
    status: selfDeaf ? 'deafened' : selfMute ? 'muted' : 'connected',
    self: true,
  }
}

function mergeLiveKitVoiceState(
  voiceState: VoiceState,
  channelId: string,
  mediaState: LiveKitVoiceState,
): VoiceState {
  if (voiceState.connectedChannelId !== channelId) {
    return voiceState
  }

  const remoteParticipants = mediaState.remoteParticipants.map((participant) => {
    const hasUnmutedAudio = participant.audioPublications.some(
      (publication) => !publication.muted,
    )

    return {
      id: participant.identity,
      channelId,
      name: shortId(participant.identity),
      status: hasUnmutedAudio ? 'speaking' : 'muted',
    } satisfies VoiceParticipant
  })
  const selfParticipant = voiceState.participants.find((participant) => participant.self)

  return {
    ...voiceState,
    connectedChannelId: mediaState.status === 'disconnected' ? null : channelId,
    mediaReady: mediaState.status === 'connected',
    participants: [
      ...voiceState.participants.filter(
        (participant) => !participant.self && participant.channelId !== channelId,
      ),
      ...(selfParticipant && mediaState.status !== 'disconnected' ? [selfParticipant] : []),
      ...remoteParticipants,
    ],
  }
}

function mergeLiveKitMeetingState(
  meetingRoom: MeetingRoomState,
  mediaState: LiveKitVoiceState,
): MeetingRoomState {
  const selfParticipant = meetingRoom.participants.find((participant) => participant.self) ?? {
    id: 'self',
    name: 'You',
    role: 'You',
    self: true,
  }
  const remoteParticipants = mediaState.remoteParticipants.map(
    (participant) =>
      ({
        id: participant.identity,
        name: shortId(participant.identity),
        role: 'Participant',
      }) satisfies MeetingRoomParticipant,
  )

  return {
    ...meetingRoom,
    mediaStatus: mediaState.status === 'connected' ? 'connected' : 'connecting',
    participants: [selfParticipant, ...remoteParticipants],
  }
}

function voiceParticipantStatus(participant: VoiceParticipant, voiceState: VoiceState) {
  if (!participant.self) {
    return participant.status
  }

  if (voiceState.selfDeaf) {
    return 'deafened'
  }

  if (voiceState.selfMute) {
    return 'muted'
  }

  return 'connected'
}

function meetingMediaStatusLabel(meetingRoom: MeetingRoomState) {
  if (meetingRoom.mediaStatus === 'connecting') {
    return 'Media room connecting'
  }

  if (meetingRoom.mediaStatus === 'error') {
    return meetingRoom.mediaError ?? 'Media room unavailable'
  }

  return 'Media room connected'
}

function meetingParticipantStatus(
  participant: MeetingRoomParticipant,
  meetingRoom: MeetingRoomState,
) {
  if (!participant.self) {
    return 'connected'
  }

  if (meetingRoom.selfMute) {
    return 'muted'
  }

  if (meetingRoom.cameraOff) {
    return 'camera off'
  }

  return 'connected'
}

function stopScreenShareTracks(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop())
}

function screenShareErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Screen share blocked'
  }

  return 'Screen share failed'
}

function screenShareErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    }
  }

  return {
    message: String(error),
    name: typeof error,
  }
}

function imagePreviewUrl(file: File) {
  if (!file.type.startsWith('image/') || typeof URL.createObjectURL !== 'function') {
    return undefined
  }

  return URL.createObjectURL(file)
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  const kib = sizeBytes / 1024
  if (kib < 1024) {
    return `${kib.toFixed(kib >= 10 ? 0 : 1)} KiB`
  }

  const mib = kib / 1024
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`
}

function richEmbedLabel(embed: RichEmbed) {
  return embed.title ?? embed.author?.name ?? embed.description?.slice(0, 64) ?? 'Untitled'
}

function developerPermissionLabel(permissionId: DeveloperPermissionId) {
  return (
    developerPermissionOptions.find((permission) => permission.id === permissionId)?.label ??
    permissionId
  )
}

function developerPermissionSummary(permissionIds: DeveloperPermissionId[]) {
  if (permissionIds.length === 0) {
    return 'No permissions selected'
  }

  return permissionIds.map(developerPermissionLabel).join(', ')
}

function richEmbedAccentColor(color: number | undefined) {
  if (typeof color !== 'number' || !Number.isFinite(color)) {
    return '#4b5fc4'
  }

  const normalized = Math.max(0, Math.min(0xffffff, Math.trunc(color)))
  return `#${normalized.toString(16).padStart(6, '0')}`
}

function formatEmbedTimestamp(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function safeRealtimeURL(serverURL: string) {
  try {
    return realtimeUrlForServer(serverURL)
  } catch {
    return undefined
  }
}

function getOpenCordDesktopRuntime(): OpenCordDesktopRuntime | null {
  const runtime = window.openCordDesktop
  if (!runtime || typeof runtime.platform !== 'string') {
    return null
  }

  return runtime
}

type WebNotificationPermissionState = 'blocked' | 'granted' | 'promptable' | 'unsupported'

function currentWebNotificationPermission(): WebNotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }

  return webNotificationPermissionFromBrowser(Notification.permission)
}

function webNotificationPermissionFromBrowser(
  permission: NotificationPermission,
): WebNotificationPermissionState {
  switch (permission) {
    case 'granted':
      return 'granted'
    case 'denied':
      return 'blocked'
    case 'default':
      return 'promptable'
  }
}

function webNotificationPermissionLabel(permission: WebNotificationPermissionState) {
  switch (permission) {
    case 'granted':
      return 'Granted'
    case 'blocked':
      return 'Blocked'
    case 'promptable':
      return 'Not granted'
    case 'unsupported':
      return 'Not supported'
  }
}

function opencordMediaRtcConfig() {
  return window.__OPENCORD_MEDIA_RTC_CONFIG__
}

function isRealtimeEvent(event: RealtimeIncomingEnvelope): event is RealtimeEventEnvelope {
  return 'id' in event && typeof event.id === 'string' && 'scope' in event
}

function unknownRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function realtimeStatusText(status: RealtimeConnectionStatus) {
  switch (status) {
    case 'connecting':
      return 'Realtime connecting'
    case 'open':
      return 'Realtime connected'
    case 'error':
    case 'closed':
      return 'Realtime disconnected'
    case 'idle':
      return 'Realtime ready'
  }
}

let localBotTokenCounter = 0

function createLocalBotId(name: string) {
  return `local-bot-${Date.now()}-${slugOpenCordTitle(name)}`
}

function createLocalBotToken() {
  localBotTokenCounter += 1
  const bytes = new Uint8Array(18)
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes)
  } else {
    const fallback = `${Date.now()}-${Math.random()}-${localBotTokenCounter}`
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = fallback.charCodeAt(index % fallback.length) % 256
    }
  }

  const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  const counterSuffix = localBotTokenCounter.toString(36).padStart(4, '0')
  return `ocb_${randomHex}${counterSuffix}`
}

function hiddenBotTokenLabel(lastFour: string | null) {
  return lastFour ? `Hidden after creation - last 4 ${lastFour}` : 'Hidden after creation'
}

let localWebhookTokenCounter = 0

function createLocalWebhookId(name: string) {
  return `local-webhook-${Date.now()}-${slugOpenCordTitle(name)}`
}

function createLocalWebhookToken() {
  localWebhookTokenCounter += 1
  const bytes = new Uint8Array(18)
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes)
  } else {
    const fallback = `${Date.now()}-${Math.random()}-${localWebhookTokenCounter}`
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = fallback.charCodeAt(index % fallback.length) % 256
    }
  }

  const randomHex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  const counterSuffix = localWebhookTokenCounter.toString(36).padStart(4, '0')
  return `ocw_${randomHex}${counterSuffix}`
}

function hiddenWebhookTokenLabel(lastFour: string | null) {
  return lastFour ? `Hidden after creation - last 4 ${lastFour}` : 'Hidden after creation'
}

function webhookExecuteURL(serverURL: string, webhookId: string, token: string) {
  return `${serverURL.replace(/\/+$/g, '')}/api/webhooks/${webhookId}/${token}`
}

function developerWebhookFromDetail(webhook: IncomingWebhook): DeveloperWebhook {
  return {
    id: webhook.id,
    channelId: webhook.channelId,
    name: webhook.name,
    token: hiddenWebhookTokenLabel(webhook.tokenLastFour),
    tokenLastFour: webhook.tokenLastFour,
    executeUrl: 'Rotate token to reveal execute URL',
    serverManaged: true,
  }
}

function developerWebhookFromShownToken(webhook: IncomingWebhookWithToken): DeveloperWebhook {
  return {
    id: webhook.id,
    channelId: webhook.channelId,
    name: webhook.name,
    token: webhook.token,
    tokenLastFour: webhook.tokenLastFour,
    executeUrl: webhook.executeUrl,
    serverManaged: true,
  }
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function loadBrowserServerConnectionState() {
  if (typeof window === 'undefined') {
    return createDefaultServerConnectionState()
  }

  return loadServerConnectionState(window.localStorage)
}

function saveBrowserServerConnectionState(
  state: ReturnType<typeof createDefaultServerConnectionState>,
) {
  if (typeof window === 'undefined') {
    return
  }

  saveServerConnectionState(window.localStorage, state)
}

function desktopDeviceSessionStores(): DeviceSessionStores | null {
  if (typeof window === 'undefined' || !window.openCordDesktop?.deviceSessions) {
    return null
  }

  const bridge = window.openCordDesktop.deviceSessions

  return {
    metadata: {
      getItem: (key) => window.localStorage.getItem(key),
      removeItem: (key) => window.localStorage.removeItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    secrets: {
      getItem: (key) => bridge.getSecret(key),
      removeItem: (key) => bridge.removeSecret(key).then(() => undefined),
      setItem: (key, value) => bridge.setSecret(key, value).then(() => undefined),
    },
  }
}

function loadLocalAlphaSession(): LocalAlphaSessionSnapshot | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(localAlphaSessionStorageKey)
    if (!raw) {
      return null
    }

    const snapshot = JSON.parse(raw) as Partial<LocalAlphaSessionSnapshot>
    if (
      typeof snapshot.baseUrl !== 'string' ||
      typeof snapshot.email !== 'string' ||
      typeof snapshot.displayName !== 'string' ||
      typeof snapshot.user?.id !== 'string' ||
      typeof snapshot.user.email !== 'string' ||
      typeof snapshot.user.displayName !== 'string' ||
      typeof snapshot.organization?.id !== 'string' ||
      typeof snapshot.organization.name !== 'string'
    ) {
      clearLocalAlphaSession()
      return null
    }

    return {
      baseUrl: snapshot.baseUrl,
      displayName: snapshot.displayName,
      email: snapshot.email,
      organization: snapshot.organization,
      reconnectVoiceChannelId:
        typeof snapshot.reconnectVoiceChannelId === 'string'
          ? snapshot.reconnectVoiceChannelId
          : null,
      user: snapshot.user,
    }
  } catch {
    clearLocalAlphaSession()
    return null
  }
}

function saveLocalAlphaSession(snapshot: LocalAlphaSessionSnapshot) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(localAlphaSessionStorageKey, JSON.stringify(snapshot))
}

function clearLocalAlphaSession() {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.removeItem(localAlphaSessionStorageKey)
}
