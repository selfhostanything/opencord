import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createOpenCordApiClient,
  type IncomingWebhook,
  type IncomingWebhookWithToken,
  type ServerHealth,
} from '@opencord/api-client'
import {
  INITIAL_REALTIME_STATUS,
  realtimeUrlForServer,
  type RealtimeConnectionStatus,
} from '@opencord/realtime'
import {
  activeServerConnection,
  createDefaultServerConnectionState,
  loadServerConnectionState,
  removeServerConnection,
  saveServerConnectionState,
  switchServerConnection,
  upsertServerConnection,
  type ServerConnection,
} from '@opencord/server-connections'

import './App.css'

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
  selfMute: boolean
  selfDeaf: boolean
  participants: VoiceParticipant[]
}

type ScreenShareState =
  | { status: 'idle' }
  | { status: 'starting' }
  | { status: 'sharing'; stream: MediaStream }
  | { status: 'error'; message: string }

type ActivePanel = 'chat' | 'calendar' | 'developers' | 'meeting'

type DeveloperBot = {
  id: string
  organizationId?: string
  botUserId?: string
  name: string
  description: string
  token: string
  invitedSpaceIds: string[]
  serverManaged?: boolean
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
  selfMute: boolean
  cameraOff: boolean
  participants: MeetingRoomParticipant[]
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

export default function App() {
  const [serverConnections, setServerConnections] = useState(() =>
    loadBrowserServerConnectionState(),
  )
  const activeConnection =
    activeServerConnection(serverConnections) ??
    activeServerConnection(createDefaultServerConnectionState())!
  const [serverURL, setServerURL] = useState(activeConnection.baseUrl)
  const [serverDisplayName, setServerDisplayName] = useState('')
  const [health, setHealth] = useState<HealthState>({ status: 'checking' })
  const [realtimeStatus] = useState<RealtimeConnectionStatus>(INITIAL_REALTIME_STATUS)
  const [spaces] = useState(initialSpaces)
  const [channels, setChannels] = useState(initialChannels)
  const [messages, setMessages] = useState(initialMessages)
  const [selectedSpaceId, setSelectedSpaceId] = useState(initialSpaces[0].id)
  const [selectedChannelId, setSelectedChannelId] = useState(initialChannels[0].id)
  const [composerText, setComposerText] = useState('')
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([])
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [editingMessage, setEditingMessage] = useState<{ id: string; body: string } | null>(null)
  const [voiceState, setVoiceState] = useState(initialVoiceState)
  const [screenShareState, setScreenShareState] = useState<ScreenShareState>({ status: 'idle' })
  const [activePanel, setActivePanel] = useState<ActivePanel>('chat')
  const [meetings, setMeetings] = useState(initialMeetings)
  const [showMeetingForm, setShowMeetingForm] = useState(false)
  const [newMeetingTitle, setNewMeetingTitle] = useState('')
  const [newMeetingStartsAt, setNewMeetingStartsAt] = useState('2026-06-25T10:00')
  const [newMeetingEndsAt, setNewMeetingEndsAt] = useState('2026-06-25T10:30')
  const [meetingRoom, setMeetingRoom] = useState<MeetingRoomState | null>(null)
  const [developerBots, setDeveloperBots] = useState<DeveloperBot[]>([])
  const [developerWebhooks, setDeveloperWebhooks] = useState<DeveloperWebhook[]>([])
  const [developerSessionToken, setDeveloperSessionToken] = useState('')
  const [developerOrganizationId, setDeveloperOrganizationId] = useState('')
  const [developerSpaceId, setDeveloperSpaceId] = useState('')
  const [developerChannelId, setDeveloperChannelId] = useState('')
  const [developerError, setDeveloperError] = useState<string | null>(null)
  const [newBotName, setNewBotName] = useState('')
  const [newBotDescription, setNewBotDescription] = useState('')
  const [newWebhookName, setNewWebhookName] = useState('')

  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]
  const visibleChannels = channels.filter((channel) => channel.spaceId === selectedSpace.id)
  const selectedChannel =
    visibleChannels.find((channel) => channel.id === selectedChannelId) ?? visibleChannels[0]
  const channelMessages = messages.filter((message) => message.channelId === selectedChannel.id)
  const groupedMembers = useMemo(() => groupMembersByRole(members), [])
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

  useEffect(() => {
    void checkServer(activeConnection.baseUrl)
  }, [])

  useEffect(() => {
    saveBrowserServerConnectionState(serverConnections)
  }, [serverConnections])

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

  async function createDeveloperBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newBotName.trim()
    if (!name) {
      return
    }
    const description = newBotDescription.trim()

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
            invitedSpaceIds: [],
            serverManaged: true,
          },
        ])
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
        invitedSpaceIds: [],
      },
    ])
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
          invitedSpaceIds: detail.spaceMemberships.map((membership) => membership.spaceId),
          serverManaged: true,
        })),
      )
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
      } catch (error) {
        setDeveloperError(error instanceof Error ? error.message : 'Unable to rotate token')
      }
      return
    }

    setDeveloperBots((current) =>
      current.map((bot) =>
        bot.id === botId ? { ...bot, token: createLocalBotToken() } : bot,
      ),
    )
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
  }

  function addChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = normalizeChannelName(newChannelName)
    if (!name) {
      return
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

  function createMeeting(event: FormEvent<HTMLFormElement>) {
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

    const joinSlug = `local-${slugForMeetingTitle(title)}`
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

  function joinMeetingRoom(meeting: CalendarMeeting) {
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

    setMeetingRoom({
      meeting,
      selfMute: false,
      cameraOff: false,
      participants,
    })
    setActivePanel('meeting')
  }

  function leaveMeetingRoom() {
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
    setMeetingRoom((current) =>
      current ? { ...current, selfMute: !current.selfMute } : current,
    )
  }

  function toggleMeetingCamera() {
    setMeetingRoom((current) =>
      current ? { ...current, cameraOff: !current.cameraOff } : current,
    )
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = composerText.trim()
    if ((!body && pendingAttachments.length === 0) || !selectedChannel.canSend) {
      return
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

  function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMessage) {
      return
    }

    const body = editingMessage.body.trim()
    if (!body) {
      return
    }

    setMessages((current) =>
      current.map((message) =>
        message.id === editingMessage.id ? { ...message, body, edited: true } : message,
      ),
    )
    setEditingMessage(null)
  }

  function deleteMessage(messageId: string) {
    setMessages((current) => current.filter((message) => message.id !== messageId))
  }

  function joinVoiceChannel(channelId: string) {
    const channel = channels.find((candidate) => candidate.id === channelId)
    if (channel?.kind !== 'voice') {
      return
    }

    setVoiceState((current) => {
      const withoutSelf = current.participants.filter((participant) => !participant.self)

      return {
        ...current,
        connectedChannelId: channelId,
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
    setScreenShareState((current) => {
      if (current.status === 'sharing') {
        stopScreenShareTracks(current.stream)
      }

      return { status: 'idle' }
    })
    setVoiceState((current) => ({
      ...current,
      connectedChannelId: null,
      selfMute: false,
      selfDeaf: false,
      participants: current.participants.filter((participant) => !participant.self),
    }))
  }

  function toggleSelfMute() {
    setVoiceState((current) => {
      const selfMute = !current.selfMute

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
      (!voiceState.connectedChannelId && !meetingRoom) ||
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
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
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
          setScreenShareState({ status: 'idle' })
        },
        { once: true },
      )
      setScreenShareState({ status: 'sharing', stream })
    } catch (error) {
      setScreenShareState({ status: 'error', message: screenShareErrorMessage(error) })
    }
  }

  function stopScreenShare() {
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

  return (
    <main className="app-shell">
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

        <div className="user-footer">
          <div className="avatar">Y</div>
          <div>
            <strong>You</strong>
            <span>Online</span>
          </div>
          <button type="button" aria-label="User settings">
            Set
          </button>
        </div>
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
    </main>
  )
}

function DeveloperSettingsPanel({
  activeConnection,
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
}: {
  activeConnection: ServerConnection
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
              <time dateTime={meeting.startsAt}>{formatMeetingDay(meeting.startsAt)}</time>
              <span>{formatMeetingClock(meeting.startsAt, meeting.endsAt)}</span>
            </div>
            <div className="meeting-card-body">
              <header>
                <h3>{meeting.title}</h3>
                <span>{meetingChannelName(meeting, channels)}</span>
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
  meetingRoom,
  screenShareState,
  onLeave,
  onStartScreenShare,
  onStopScreenShare,
  onToggleCamera,
  onToggleMute,
}: {
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
            {formatMeetingDay(meetingRoom.meeting.startsAt)} ·{' '}
            {formatMeetingClock(meetingRoom.meeting.startsAt, meetingRoom.meeting.endsAt)}
          </p>
        </div>
        <strong>Media room connected</strong>
      </header>

      <div className="meeting-room-join">
        <span>Join URL</span>
        <code>{meetingRoom.meeting.joinUrl}</code>
      </div>

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
          disabled={screenShareState.status === 'starting'}
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
    const voiceChannelName = displayChannelName(channel.name)
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
        <span>{isConnected ? displayChannelName(activeChannel.name) : 'Join a voice channel'}</span>
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
          disabled={!isConnected || screenShareState.status === 'starting'}
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

function formatMeetingDay(value: string) {
  const date = parseMeetingDate(value)
  if (!date) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatMeetingClock(startsAt: string, endsAt: string) {
  const start = parseMeetingDate(startsAt)
  const end = parseMeetingDate(endsAt)
  if (!start || !end) {
    return `${startsAt} - ${endsAt}`
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${formatter.format(start)} - ${formatter.format(end)}`
}

function meetingChannelName(meeting: CalendarMeeting, channels: Channel[]) {
  const channel = channels.find((candidate) => candidate.id === meeting.channelId)
  if (!channel) {
    return 'Workspace'
  }

  return `${channel.kind === 'voice' ? 'Voice' : '#'} ${displayChannelName(channel.name)}`
}

function parseMeetingDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function safeRealtimeURL(serverURL: string) {
  try {
    return realtimeUrlForServer(serverURL)
  } catch {
    return undefined
  }
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

function normalizeChannelName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9- ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function slugForMeetingTitle(title: string) {
  return normalizeChannelName(title) || 'meeting'
}

let localBotTokenCounter = 0

function createLocalBotId(name: string) {
  return `local-bot-${Date.now()}-${slugForMeetingTitle(name)}`
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
  return `local-webhook-${Date.now()}-${slugForMeetingTitle(name)}`
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

function displayChannelName(name: string) {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
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
