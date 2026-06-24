import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import {
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import {
  errorCodes as documentPickerErrorCodes,
  isErrorWithCode as isDocumentPickerErrorWithCode,
  keepLocalCopy,
  pick,
  types as documentPickerTypes,
  type DocumentPickerResponse,
} from '@react-native-documents/picker'
import { RTCView } from '@livekit/react-native-webrtc'
import Clipboard from '@react-native-clipboard/clipboard'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  createOpenCordApiClient,
  OpenCordApiError,
  type AuditEvent,
  type AuthResult,
  type BotApplicationDetail,
  type Channel,
  type IncomingWebhook,
  type IncomingWebhookWithToken,
  type Meeting,
  type MessageAttachment,
} from '@opencord/api-client'
import {
  INITIAL_REALTIME_STATUS,
  createOpenCordRealtimeClient,
  type RealtimeIncomingEnvelope,
} from '@opencord/realtime'
import {
  clearActiveDeviceSession,
  loadActiveDeviceSession,
  persistDeviceSession,
  type ServerConnection,
} from '@opencord/server-connections'
import {
  buildOpenCordNotificationDeepLink,
  formatOpenCordMeetingClock,
  formatOpenCordMeetingDay,
  openCordMeetingChannelLabel,
  slugOpenCordTitle,
  type OpenCordNotificationRouteTarget,
  type OpenCordSettingsPanel,
} from '@opencord/client-contracts'

import {
  activeMobileServerConnection,
  createInitialMobileState,
  DEFAULT_MOBILE_ORGANIZATION_ID,
  DEFAULT_MOBILE_SPACE_ID,
  mobileDefaultOpenCordServerUrlForPlatform,
  mobileChannelsFromApiChannels,
  mobileCanListenToVoice,
  mobileCanSpeakInVoice,
  mobileComposerState,
  mobileMentionTokens,
  mobileMessageActionSheetOptions,
  mobileMessageTimelineGroups,
  mobileMemberRows,
  mobileMediaPermissionRows,
  mobileRouteTargetForChannel,
  mobileRouteTargetForMessage,
  mobileSearchViewModel,
  mobileWorkspaceNavigatorSections,
  mobileReducer,
  mobileVoiceParticipantsForChannel,
  selectedChannel,
  type MobileAppState,
  type MobileChannel,
  type MobileMemberRow,
  type MobileMessageActionId,
  type MobileMessageActionOption,
  type MobileMessageTimelineGroup,
  type MobileMessageAttachment,
  type MobileMediaPermissionKind,
  type MobileMediaPermissionRow,
  type MobileMessage,
  type MobileMessageComponent,
  type MobileRichEmbed,
  type MobileSearchScope,
  type MobileSearchViewModel,
  type MobileWorkspaceChannelRow,
  type MobileVoiceParticipant,
} from './src/mobileState'
import {
  clearMobileRuntimeStores,
  useMobileChatStore,
  useMobileDeveloperStore,
  useMobileMeetingsStore,
  useMobileSessionStore,
  useMobileSettingsStore,
  type MobileMeetingForm,
  type MobilePendingAttachment,
} from './src/mobileStores'
import { createMobileDeviceSessionStores } from './src/mobileDeviceSessionStorage'
import {
  mobileMeetingIdFromUrl,
  mobileNotificationRouteTargetFromUrl,
} from './src/mobileDeepLinks'
import {
  mobileE2ECommandFromUrl,
  mobileE2EStateUrl,
  normalizeMobileE2ECommand,
  normalizeMobileE2ELaunchConfig,
  shouldAutoJoinMobileVoice,
  type MobileE2ECommand,
} from './src/mobileE2E'
import {
  connectNativeLiveKitVoice,
  type NativeLiveKitVoiceSession,
} from './src/nativeMedia'
import {
  openNativePermissionSettings,
  queryNativeMediaPermissions,
  requestNativeMediaPermission,
} from './src/nativePermissions'
import type { NativeScreenShareStream } from './src/nativeScreenShareStreams'

type OpenCordMobileAppProps = {
  initialE2EConfig?: unknown
}

type MobileLoginCredentials = {
  email: string
  password: string
  rememberDevice?: boolean
  serverUrl: string
}

const REMEMBER_DEVICE_SWITCH_TRACK_COLOR = { false: '#4a514c', true: '#28796d' }

export default function App({ initialE2EConfig }: OpenCordMobileAppProps = {}) {
  return (
    <SafeAreaProvider>
      <OpenCordMobileApp initialE2EConfig={initialE2EConfig} />
    </SafeAreaProvider>
  )
}

function OpenCordMobileApp({ initialE2EConfig }: OpenCordMobileAppProps) {
  const [state, dispatch] = useReducer(mobileReducer, undefined, () =>
    createInitialMobileState({
      defaultServerUrl: mobileDefaultOpenCordServerUrlForPlatform(Platform.OS),
    }),
  )
  const e2eLaunchConfig = useMemo(
    () => normalizeMobileE2ELaunchConfig(initialE2EConfig),
    [initialE2EConfig],
  )
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const e2eAutoJoinStartedRef = useRef(false)
  const e2eAutoJoinMeetingStartedRef = useRef(false)
  const e2eMeetingRouteOpenedRef = useRef(false)
  const e2eAutoOpenTextChannelStartedRef = useRef(false)
  const e2eCommandPollInFlightRef = useRef(false)
  const e2eLoginStartedRef = useRef(false)
  const lastHandledIncomingUrlRef = useRef<string | null>(null)
  const pendingMeetingDeepLinkRef = useRef<string | null>(null)
  const restoreAttemptedServerUrlsRef = useRef(new Set<string>())
  const mobileDeviceSessionStoresRef = useRef(createMobileDeviceSessionStores())
  const lastE2EStateSignatureRef = useRef<string | null>(null)
  const lastE2ECommandIdRef = useRef<string | null>(null)
  const voiceSessionRef = useRef<NativeLiveKitVoiceSession | null>(null)
  const stateRef = useRef(state)
  const beginMobileEdit = useMobileChatStore((store) => store.beginEdit)
  const beginMobileReply = useMobileChatStore((store) => store.beginReply)
  const clearMobileComposer = useMobileChatStore((store) => store.clearComposer)
  const clearMobileDraftTarget = useMobileChatStore((store) => store.clearDraftTarget)
  const composerTextByChannelId = useMobileChatStore((store) => store.composerTextByChannelId)
  const editTarget = useMobileChatStore((store) => store.editTarget)
  const messageActionSheetTarget = useMobileChatStore((store) => store.messageActionSheetTarget)
  const openMobileMessageActions = useMobileChatStore((store) => store.openMessageActions)
  const pendingAttachmentsByChannelId = useMobileChatStore(
    (store) => store.pendingAttachmentsByChannelId,
  )
  const replyTarget = useMobileChatStore((store) => store.replyTarget)
  const setMobileComposerText = useMobileChatStore((store) => store.setComposerText)
  const setMobilePendingAttachments = useMobileChatStore(
    (store) => store.setPendingAttachments,
  )
  const closeMobileMeetingForm = useMobileMeetingsStore((store) => store.closeForm)
  const mobileAuditEventsBySpaceId = useMobileDeveloperStore(
    (store) => store.auditEventsBySpaceId,
  )
  const mobileBotApplications = useMobileDeveloperStore(
    (store) => store.botApplications,
  )
  const mobileWebhooksByChannelId = useMobileDeveloperStore(
    (store) => store.webhooksByChannelId,
  )
  const localMeetingReminders = useMobileMeetingsStore(
    (store) => store.localRemindersByMeetingId,
  )
  const meetings = useMobileMeetingsStore((store) => store.meetings)
  const meetingForm = useMobileMeetingsStore((store) => store.form)
  const openMobileMeetingCreateForm = useMobileMeetingsStore((store) => store.openCreateForm)
  const openMobileMeetingEditForm = useMobileMeetingsStore((store) => store.openEditForm)
  const selectMobileMeeting = useMobileMeetingsStore((store) => store.selectMeeting)
  const selectedMeetingId = useMobileMeetingsStore((store) => store.selectedMeetingId)
  const setMobileMeetingFormField = useMobileMeetingsStore((store) => store.setFormField)
  const setMobileMeetings = useMobileMeetingsStore((store) => store.setMeetings)
  const setMobileMeetingLocalReminder = useMobileMeetingsStore(
    (store) => store.setLocalReminder,
  )
  const upsertMobileMeeting = useMobileMeetingsStore((store) => store.upsertMeeting)
  const removeMobileIncomingWebhook = useMobileDeveloperStore(
    (store) => store.removeIncomingWebhook,
  )
  const setMobileAuditEvents = useMobileDeveloperStore((store) => store.setAuditEvents)
  const setMobileBotApplications = useMobileDeveloperStore(
    (store) => store.setBotApplications,
  )
  const setMobileIncomingWebhooks = useMobileDeveloperStore(
    (store) => store.setIncomingWebhooks,
  )
  const upsertMobileBotApplication = useMobileDeveloperStore(
    (store) => store.upsertBotApplication,
  )
  const upsertMobileIncomingWebhook = useMobileDeveloperStore(
    (store) => store.upsertIncomingWebhook,
  )
  const activeSettingsPanel = useMobileSettingsStore((store) => store.activePanel)
  const setMobileAccountMetadata = useMobileSessionStore((store) => store.setAccountMetadata)
  const setMobileRouteTarget = useMobileSessionStore((store) => store.setRouteTarget)
  const openMobileSettingsPanel = useMobileSettingsStore((store) => store.openPanel)
  const [serverUrl, setServerUrl] = useState(state.serverUrl)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberDevice, setRememberDevice] = useState(true)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading'>('idle')
  const [chatFeedback, setChatFeedback] = useState<string | null>(null)
  const [meetingFeedback, setMeetingFeedback] = useState<string | null>(null)
  const [meetingPanelOpen, setMeetingPanelOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [serverManagerOpen, setServerManagerOpen] = useState(false)
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null)
  const [notificationRouteStatus, setNotificationRouteStatus] = useState('No local tap routed yet.')
  const [logoutStatus, setLogoutStatus] = useState<'idle' | 'loading'>('idle')
  const [activeDeviceSessionSaved, setActiveDeviceSessionSaved] = useState(false)
  const [developerStatus, setDeveloperStatus] = useState<'idle' | 'loading'>('idle')
  const [developerFeedback, setDeveloperFeedback] = useState<string | null>(null)
  const [developerBotName, setDeveloperBotName] = useState('Mobile Bot')
  const [developerWebhookName, setDeveloperWebhookName] = useState('Mobile Hook')
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null)
  const [memberDrawerOpen, setMemberDrawerOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchScope, setSearchScope] = useState<MobileSearchScope>('all')
  const activeChannel = selectedChannel(state)
  const activeServer = activeMobileServerConnection(state)
  const developerOrganizationId =
    activeChannel.organizationId ?? meetingOrganizationIdFromMobileChannels(state.channels)
  const developerSpaceId =
    activeChannel.spaceId ??
    state.channels.find((channel) => channel.spaceId)?.spaceId ??
    DEFAULT_MOBILE_SPACE_ID
  const developerTextChannel =
    activeChannel.kind === 'text'
      ? activeChannel
      : state.channels.find((channel) => channel.kind === 'text') ?? null
  const developerChannelId = developerTextChannel?.id ?? null
  const developerWebhooks = developerChannelId
    ? mobileWebhooksByChannelId[developerChannelId] ?? []
    : []
  const developerAuditEvents = developerSpaceId
    ? mobileAuditEventsBySpaceId[developerSpaceId] ?? []
    : []
  const composerText = composerTextByChannelId[state.selectedChannelId] ?? ''
  const pendingAttachments = pendingAttachmentsByChannelId[state.selectedChannelId] ?? []
  const timelineGroups = useMemo(() => mobileMessageTimelineGroups(state), [state])
  const permissionRows = useMemo(() => mobileMediaPermissionRows(state), [state])
  const searchViewModel = useMemo(
    () => mobileSearchViewModel(state, { query: searchQuery, scope: searchScope }),
    [searchQuery, searchScope, state],
  )
  const memberRows = useMemo(() => mobileMemberRows(state), [state])
  const workspaceSections = useMemo(() => mobileWorkspaceNavigatorSections(state), [state])
  const selectedMeeting =
    meetings.find((meeting) => meeting.id === selectedMeetingId) ?? meetings[0] ?? null
  const replyPreviewMessage = replyTarget
    ? state.messages.find((message) => message.id === replyTarget.messageId)
    : null
  const editTargetMessage = editTarget
    ? state.messages.find((message) => message.id === editTarget.messageId)
    : null
  const messageActionSheetMessage = messageActionSheetTarget
    ? state.messages.find((message) => message.id === messageActionSheetTarget.messageId)
    : null
  const messageActionSheetOptions = useMemo(
    () =>
      messageActionSheetMessage
        ? mobileMessageActionSheetOptions(state, messageActionSheetMessage.id)
        : [],
    [messageActionSheetMessage, state],
  )
  const composerUi = useMemo(
    () =>
      mobileComposerState(state, composerText, {
        editTargetMessageId: editTarget?.messageId,
        pendingAttachmentCount: pendingAttachments.length,
        replyTargetMessageId: replyTarget?.messageId,
      }),
    [composerText, editTarget?.messageId, pendingAttachments.length, replyTarget?.messageId, state],
  )
  const composerDisabledReason =
    composerUi.disabledReason === 'Write a message before sending.'
      ? null
      : composerUi.disabledReason
  const activeVoiceChannel = state.channels.find(
    (channel) => channel.id === state.voice.connectedChannelId,
  )
  const activeVoiceRoomName = activeVoiceChannel?.name ?? state.voice.media?.displayName
  const voiceParticipants = useMemo(() => mobileVoiceParticipantsForChannel(state), [state])
  const shellStyle = useMemo(
    () => [
      styles.shell,
      {
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      },
    ],
    [insets.bottom, insets.top],
  )
  const loginPanelStyle = useMemo(
    () => [styles.loginPanel, { paddingTop: Math.max(40, height * 0.1) }],
    [height],
  )
  const permissionPanelMaxHeight = Math.min(
    720,
    Math.max(420, height - insets.top - insets.bottom - 168),
  )

  useEffect(() => {
    setServerUrl(state.serverUrl)
  }, [state.serverUrl])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!settingsOpen) {
      return
    }

    let cancelled = false
    void loadActiveDeviceSession(mobileDeviceSessionStoresRef.current, state.serverUrl).then(
      (storedSession) => {
        if (!cancelled) {
          setActiveDeviceSessionSaved(Boolean(storedSession))
        }
      },
    )

    return () => {
      cancelled = true
    }
  }, [settingsOpen, state.serverUrl])

  useEffect(() => {
    setMobileAccountMetadata(state.account)
  }, [setMobileAccountMetadata, state.account])

  useEffect(() => {
    const routeTarget = mobileRouteTargetForChannel(state)
    if (routeTarget) {
      setMobileRouteTarget(routeTarget)
    }
  }, [setMobileRouteTarget, state])

  useEffect(() => {
    if (!state.sessionToken) {
      dispatch({ type: 'realtime.status_changed', status: INITIAL_REALTIME_STATUS })
      return
    }

    const client = createOpenCordRealtimeClient({
      serverUrl: state.serverUrl,
      token: state.sessionToken,
    })
    const unsubscribeStatus = client.onStatus((status) => {
      dispatch({ type: 'realtime.status_changed', status })
    })
    const unsubscribeEvent = client.onEvent((event) => {
      handleMobileRealtimeEvent(event)
    })
    client.connect()

    return () => {
      unsubscribeEvent()
      unsubscribeStatus()
      client.disconnect()
    }
  }, [state.serverUrl, state.sessionToken])

  useEffect(() => {
    if (!e2eLaunchConfig || e2eLoginStartedRef.current) {
      return
    }

    e2eLoginStartedRef.current = true
    console.info(
      'OpenCord mobile e2e launch',
      JSON.stringify({
        autoJoinMeeting: e2eLaunchConfig.autoJoinMeeting,
        autoJoinVoice: e2eLaunchConfig.autoJoinVoice,
        email: e2eLaunchConfig.email,
        meetingId: e2eLaunchConfig.meetingId,
        runId: e2eLaunchConfig.runId,
        restoreOnly: e2eLaunchConfig.restoreOnly,
        serverUrl: e2eLaunchConfig.serverUrl,
      }),
    )
    setServerUrl(e2eLaunchConfig.serverUrl)
    setEmail(e2eLaunchConfig.email)
    setPassword(e2eLaunchConfig.password)
    setRememberDevice(e2eLaunchConfig.rememberDevice)
    if (e2eLaunchConfig.restoreOnly) {
      return
    }
    if (e2eLaunchConfig.demoWorkspace) {
      setMobileMeetings(seedMobileMeetings(e2eLaunchConfig.email))
      dispatch({
        type: 'login.submit',
        serverUrl: e2eLaunchConfig.serverUrl,
        email: e2eLaunchConfig.email,
      })
      return
    }

    void submitLogin(e2eLaunchConfig)
  }, [e2eLaunchConfig])

  useEffect(() => {
    const channelId = shouldAutoJoinMobileVoice({
      autoJoinStarted: e2eAutoJoinStartedRef.current,
      channels: state.channels,
      config: e2eLaunchConfig,
      screen: state.screen,
      sessionToken: state.sessionToken,
    })
    if (!channelId) {
      return
    }

    e2eAutoJoinStartedRef.current = true
    void joinMobileVoice(channelId)
  }, [e2eLaunchConfig, state.channels, state.screen, state.sessionToken])

  useEffect(() => {
    if (
      e2eAutoOpenTextChannelStartedRef.current ||
      !e2eLaunchConfig?.preferredTextChannelName ||
      state.screen !== 'channels'
    ) {
      return
    }

    const channel = state.channels.find(
      (candidate) =>
        candidate.kind === 'text' &&
        candidate.name.toLowerCase() === e2eLaunchConfig.preferredTextChannelName?.toLowerCase(),
    )
    if (!channel) {
      return
    }

    e2eAutoOpenTextChannelStartedRef.current = true
    dispatch({ type: 'channel.select', channelId: channel.id })
  }, [e2eLaunchConfig?.preferredTextChannelName, state.channels, state.screen])

  useEffect(() => {
    if (
      e2eMeetingRouteOpenedRef.current ||
      !e2eLaunchConfig?.meetingId ||
      e2eLaunchConfig.autoJoinMeeting ||
      state.screen !== 'channels'
    ) {
      return
    }

    const meeting =
      meetings.find((candidate) => candidate.id === e2eLaunchConfig.meetingId) ??
      meetings[0] ??
      null
    if (!meeting) {
      return
    }

    e2eMeetingRouteOpenedRef.current = true
    openMobileMeetingDetail(meeting)
  }, [
    e2eLaunchConfig?.autoJoinMeeting,
    e2eLaunchConfig?.meetingId,
    meetings,
    state.screen,
  ])

  useEffect(() => {
    if (
      e2eAutoJoinMeetingStartedRef.current ||
      !e2eLaunchConfig?.autoJoinMeeting ||
      !e2eLaunchConfig.meetingId ||
      state.screen !== 'channels' ||
      !state.sessionToken
    ) {
      return
    }

    e2eAutoJoinMeetingStartedRef.current = true
    void joinMobileMeeting(
      e2eLaunchConfig.meetingId,
      e2eLaunchConfig.meetingTitle ?? 'OpenCord meeting',
    )
  }, [e2eLaunchConfig, state.screen, state.sessionToken])

  useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      handleIncomingUrl(url)
    }

    const subscription = Linking.addEventListener('url', handleUrl)
    void Linking.getInitialURL().then((url) => {
      if (url) {
        handleUrl({ url })
      }
    })

    return () => {
      subscription.remove()
    }
  }, [
    e2eLaunchConfig,
    meetings,
    state.screen,
    state.voice.connectedChannelId,
    state.voice.selfDeaf,
    state.voice.selfMute,
  ])

  useEffect(() => {
    const pendingMeetingDeepLink = pendingMeetingDeepLinkRef.current
    if (!pendingMeetingDeepLink || meetings.length === 0) {
      return
    }

    openMobileMeetingFromUrl(pendingMeetingDeepLink)
  }, [meetings])

  useEffect(() => {
    const commandUrl = e2eLaunchConfig?.commandUrl
    if (!commandUrl) {
      return
    }

    let stopped = false
    const pollCommand = async () => {
      if (e2eCommandPollInFlightRef.current) {
        return
      }

      e2eCommandPollInFlightRef.current = true
      try {
        const response = await fetch(commandUrl, {
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-store',
          },
        })
        if (!response.ok || stopped) {
          return
        }

        const body = (await response.json()) as Record<string, unknown>
        const command = normalizeMobileE2ECommand(body.command)
        const id =
          typeof body.id === 'number' || typeof body.id === 'string' ? String(body.id) : null
        if (!command || !id || lastE2ECommandIdRef.current === id || stopped) {
          return
        }

        lastE2ECommandIdRef.current = id
        console.info('OpenCord mobile e2e command', JSON.stringify({ command, id }))
        runMobileE2ECommand(command)
      } catch {
        // The Phase 10 harness can briefly restart while the simulator is still running.
      } finally {
        e2eCommandPollInFlightRef.current = false
      }
    }

    void pollCommand()
    const interval = setInterval(() => {
      void pollCommand()
    }, 500)

    return () => {
      stopped = true
      clearInterval(interval)
    }
  }, [e2eLaunchConfig?.commandUrl, state.voice.connectedChannelId, state.voice.selfDeaf, state.voice.selfMute])

  useEffect(() => {
    const stateUrl = mobileE2EStateUrl(e2eLaunchConfig?.commandUrl ?? null)
    if (!stateUrl) {
      return
    }

    const mediaSnapshot = voiceSessionRef.current?.snapshot()
    const remoteScreenShareStreams =
      state.voice.media?.remoteScreenShareStreams ??
      mediaSnapshot?.remoteScreenShareStreams ??
      []
    const payload = {
      accountEmail: state.account?.email ?? null,
      realtimeStatus: state.realtimeStatus,
      runId: e2eLaunchConfig?.runId ?? null,
      screen: state.screen,
      voice: {
        canPublishAudio: state.voice.media?.canPublishAudio ?? null,
        canPublishScreen: state.voice.media?.canPublishScreen ?? null,
        canSubscribe: state.voice.media?.canSubscribe ?? null,
        connectedChannelId: state.voice.connectedChannelId,
        connectionStatus: state.voice.connectionStatus,
        displayName: state.voice.media?.displayName ?? activeVoiceRoomName ?? null,
        errorMessage: state.voice.errorMessage,
        localAudioTracks: mediaSnapshot?.localAudioTracks ?? null,
        participantIdentity: state.voice.media?.participantIdentity ?? null,
        participants: state.voice.participants.map((participant) => ({
          id: participant.id,
          name: participant.name,
          self: participant.self === true,
          status: participant.status,
        })),
        remoteAudioTracks: mediaSnapshot?.remoteAudioTracks ?? null,
        remoteScreenShares:
          state.voice.media?.remoteScreenShares ?? mediaSnapshot?.remoteScreenShares ?? 0,
        remoteScreenShareStreams: remoteScreenShareStreams.map((stream) => ({
          hasStreamUrl: stream.streamUrl.length > 0,
          id: stream.id,
          participantIdentity: stream.participantIdentity,
        })),
        roomName: state.voice.media?.roomName ?? null,
        selfDeaf: state.voice.selfDeaf,
        selfMute: state.voice.selfMute,
      },
    }
    const signature = JSON.stringify(payload)
    if (lastE2EStateSignatureRef.current === signature) {
      return
    }

    lastE2EStateSignatureRef.current = signature
    void fetch(stateUrl, {
      body: signature,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }).catch(() => {
      // The Phase 10 harness may close while the simulator is still unwinding.
    })
  }, [activeVoiceRoomName, e2eLaunchConfig?.commandUrl, e2eLaunchConfig?.runId, state])

  useEffect(() => {
    void refreshNativePermissions()

    return () => {
      void voiceSessionRef.current?.disconnect()
      voiceSessionRef.current = null
    }
  }, [])

  useEffect(() => {
    if (
      (e2eLaunchConfig && !e2eLaunchConfig.restoreOnly) ||
      state.screen !== 'login' ||
      loginStatus === 'loading'
    ) {
      return
    }

    const targetServerUrl = state.serverUrl
    if (restoreAttemptedServerUrlsRef.current.has(targetServerUrl)) {
      return
    }

    restoreAttemptedServerUrlsRef.current.add(targetServerUrl)
    void restoreMobileDeviceSession(targetServerUrl)
  }, [e2eLaunchConfig, loginStatus, state.screen, state.serverUrl])

  async function refreshNativePermissions() {
    const permissions = await queryNativeMediaPermissions()
    Object.entries(permissions).forEach(([kind, status]) => {
      if (status) {
        dispatch({
          type: 'permission.updated',
          kind: kind as MobileMediaPermissionKind,
          status,
        })
      }
    })
  }

  async function refreshMobileMeetings(
    client: ReturnType<typeof createOpenCordApiClient>,
    channels: Array<{ organizationId?: string }>,
  ) {
    const organizationId = meetingOrganizationIdFromChannels(channels)
    if (!organizationId) {
      setMobileMeetings([])
      return
    }

    try {
      const loadedMeetings = await client.listMeetings(organizationId)
      setMobileMeetings(loadedMeetings)
      if (loadedMeetings.length > 0 && !selectedMeetingId) {
        selectMobileMeeting(loadedMeetings[0]?.id ?? null)
      }
      setMeetingFeedback(null)
    } catch (error) {
      setMeetingFeedback(errorMessage(error, 'Unable to load meetings.'))
    }
  }

  async function submitLogin(credentials?: MobileLoginCredentials) {
    const loginServerUrl = credentials?.serverUrl ?? serverUrl
    const loginEmail = credentials?.email ?? email
    const loginPassword = credentials?.password ?? password
    const loginRememberDevice = credentials?.rememberDevice ?? rememberDevice

    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Email and password are required.')
      return
    }

    setLoginStatus('loading')
    setLoginError(null)
    try {
      const authClient = createOpenCordApiClient({ baseUrl: loginServerUrl })
      const authResult = await authClient.login({
        email: loginEmail,
        password: loginPassword,
        rememberDevice: loginRememberDevice,
      })
      if (loginRememberDevice) {
        setActiveDeviceSessionSaved(await persistMobileDeviceSession(loginServerUrl, authResult))
      } else {
        await clearActiveDeviceSession(mobileDeviceSessionStoresRef.current, loginServerUrl)
        setActiveDeviceSessionSaved(false)
      }
      const client = createOpenCordApiClient({
        baseUrl: loginServerUrl,
        sessionToken: authResult.session.token,
      })
      const channels = await ensureMobileWorkspaceChannels(client, authResult.user.email)
      await refreshMobileMeetings(client, channels)
      dispatch({
        type: 'login.succeeded',
        serverUrl: loginServerUrl,
        email: authResult.user.email,
        displayName: authResult.user.displayName,
        sessionToken: authResult.session.token,
        channels: mobileChannelsFromApiChannels(channels),
      })
      setPassword('')
    } catch (error) {
      setLoginError(errorMessage(error, 'Unable to log in.'))
    } finally {
      setLoginStatus('idle')
    }
  }

  async function restoreMobileDeviceSession(targetServerUrl: string) {
    const storedSession = await loadActiveDeviceSession(
      mobileDeviceSessionStoresRef.current,
      targetServerUrl,
    )
    if (!storedSession) {
      return
    }

    setLoginStatus('loading')
    setLoginError(null)
    setServerUrl(storedSession.serverUrl)
    setEmail(storedSession.accountEmail)
    try {
      const authClient = createOpenCordApiClient({ baseUrl: storedSession.serverUrl })
      const authResult = await authClient.refreshSession({
        refreshToken: storedSession.refreshToken,
      })
      setActiveDeviceSessionSaved(
        await persistMobileDeviceSession(storedSession.serverUrl, authResult),
      )
      const client = createOpenCordApiClient({
        baseUrl: storedSession.serverUrl,
        sessionToken: authResult.session.token,
      })
      const channels = await ensureMobileWorkspaceChannels(client, authResult.user.email)
      await refreshMobileMeetings(client, channels)
      dispatch({
        type: 'login.succeeded',
        serverUrl: storedSession.serverUrl,
        email: authResult.user.email,
        displayName: authResult.user.displayName,
        sessionToken: authResult.session.token,
        channels: mobileChannelsFromApiChannels(channels),
      })
    } catch (error) {
      await clearActiveDeviceSession(mobileDeviceSessionStoresRef.current, storedSession.serverUrl)
      setActiveDeviceSessionSaved(false)
      setLoginError(errorMessage(error, 'Saved login expired. Please log in again.'))
    } finally {
      setLoginStatus('idle')
    }
  }

  async function persistMobileDeviceSession(
    serverUrl: string,
    authResult: AuthResult,
  ): Promise<boolean> {
    if (!authResult.session.refreshToken) {
      return false
    }

    await persistDeviceSession(mobileDeviceSessionStoresRef.current, {
      accountEmail: authResult.user.email,
      displayName: authResult.user.displayName,
      refreshToken: authResult.session.refreshToken,
      serverUrl,
      userId: authResult.user.id,
    })
    return true
  }

  function switchServer(connectionId: string) {
    dispatch({ type: 'server.switch', connectionId })
    setServerManagerOpen(false)
  }

  function addServerConnection() {
    const baseUrl = serverUrl.trim()
    if (!baseUrl) {
      return
    }

    dispatch({ type: 'server.add', baseUrl })
    setServerManagerOpen(false)
  }

  async function clearSavedMobileLogin() {
    await clearActiveDeviceSession(mobileDeviceSessionStoresRef.current, state.serverUrl)
    setActiveDeviceSessionSaved(false)
    setSettingsFeedback('Saved login cleared for this server.')
  }

  async function logoutMobileSession() {
    if (logoutStatus === 'loading') {
      return
    }

    setLogoutStatus('loading')
    setSettingsFeedback(null)
    let logoutError: string | null = null
    const logoutServerUrl = state.serverUrl
    const logoutToken = state.sessionToken

    try {
      await voiceSessionRef.current?.disconnect()
      voiceSessionRef.current = null
      if (logoutToken) {
        await createOpenCordApiClient({
          baseUrl: logoutServerUrl,
          sessionToken: logoutToken,
        }).logout()
      }
    } catch (error) {
      logoutError = errorMessage(error, 'Server session revoke did not complete.')
    } finally {
      await clearActiveDeviceSession(mobileDeviceSessionStoresRef.current, logoutServerUrl)
      setActiveDeviceSessionSaved(false)
      clearMobileRuntimeStores()
      dispatch({ type: 'logout' })
      setMeetingFeedback(null)
      setMeetingPanelOpen(false)
      setSettingsOpen(false)
      setServerManagerOpen(false)
      setPassword('')
      setLoginError(
        logoutError ? `${logoutError} Local saved login was cleared.` : null,
      )
      setLogoutStatus('idle')
    }
  }

  function mobileDeveloperApiContext(options: {
    requireSpace?: boolean
    requireTextChannel?: boolean
  } = {}) {
    if (!state.sessionToken) {
      setDeveloperFeedback('Sign in to a server before using developer tools.')
      return null
    }
    if (!developerOrganizationId || !isServerBackedId(developerOrganizationId)) {
      setDeveloperFeedback('Developer tools need a server-backed organization.')
      return null
    }
    if (
      options.requireSpace &&
      (!developerSpaceId || !isServerBackedId(developerSpaceId))
    ) {
      setDeveloperFeedback('This action needs a server-backed space.')
      return null
    }
    if (
      options.requireTextChannel &&
      (!developerChannelId || !isServerBackedId(developerChannelId))
    ) {
      setDeveloperFeedback('Incoming webhooks need a server-backed text channel.')
      return null
    }

    return {
      channelId: developerChannelId,
      client: createOpenCordApiClient({
        baseUrl: state.serverUrl,
        sessionToken: state.sessionToken,
      }),
      organizationId: developerOrganizationId,
      spaceId: developerSpaceId,
    }
  }

  async function loadMobileDeveloperBots() {
    const context = mobileDeveloperApiContext()
    if (!context) {
      return
    }

    setDeveloperStatus('loading')
    try {
      const bots = await context.client.listBotApplications(context.organizationId)
      setMobileBotApplications(bots)
      setDeveloperFeedback(`Loaded ${bots.length} bot application${bots.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to load bot applications.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function createMobileDeveloperBot() {
    const context = mobileDeveloperApiContext()
    if (!context) {
      return
    }

    const name = developerBotName.trim()
    if (!name) {
      setDeveloperFeedback('Bot name is required.')
      return
    }

    setDeveloperStatus('loading')
    try {
      const created = await context.client.createBotApplication(context.organizationId, {
        description: 'Created from OpenCord mobile settings.',
        name,
      })
      Clipboard.setString(created.botToken.token)
      upsertMobileBotApplication({
        activeTokenLastFour: created.botToken.tokenLastFour,
        botApplication: created.botApplication,
        spaceMemberships: [],
      })
      setDeveloperBotName('')
      setDeveloperFeedback(
        `Bot token copied. Last four: ${lastFourSecretLabel(created.botToken.tokenLastFour)}.`,
      )
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to create bot application.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function rotateMobileDeveloperBotToken(applicationId: string) {
    const context = mobileDeveloperApiContext()
    const bot = mobileBotApplications.find(
      (candidate) => candidate.botApplication.id === applicationId,
    )
    if (!context || !bot) {
      return
    }

    setDeveloperStatus('loading')
    try {
      const token = await context.client.rotateBotToken(context.organizationId, applicationId)
      Clipboard.setString(token.token)
      upsertMobileBotApplication({
        ...bot,
        activeTokenLastFour: token.tokenLastFour,
      })
      setDeveloperFeedback(
        `${bot.botApplication.name} token copied. Last four: ${lastFourSecretLabel(
          token.tokenLastFour,
        )}.`,
      )
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to rotate bot token.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function inviteMobileDeveloperBot(applicationId: string) {
    const context = mobileDeveloperApiContext({ requireSpace: true })
    const bot = mobileBotApplications.find(
      (candidate) => candidate.botApplication.id === applicationId,
    )
    if (!context || !bot) {
      return
    }

    setDeveloperStatus('loading')
    try {
      const invite = await context.client.inviteBotApplicationToSpace(
        context.organizationId,
        applicationId,
        context.spaceId,
        { role: 'member' },
      )
      upsertMobileBotApplication({
        ...bot,
        botApplication: invite.botApplication,
        spaceMemberships: [
          ...bot.spaceMemberships.filter(
            (membership) => membership.spaceId !== invite.member.spaceId,
          ),
          invite.member,
        ],
      })
      setDeveloperFeedback(`${bot.botApplication.name} invited to this space.`)
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to invite bot.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function loadMobileDeveloperWebhooks() {
    const context = mobileDeveloperApiContext({ requireTextChannel: true })
    if (!context || !context.channelId) {
      return
    }

    setDeveloperStatus('loading')
    try {
      const webhooks = await context.client.listIncomingWebhooks(context.channelId)
      setMobileIncomingWebhooks(context.channelId, webhooks)
      setDeveloperFeedback(`Loaded ${webhooks.length} incoming webhook${webhooks.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to load incoming webhooks.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function createMobileDeveloperWebhook() {
    const context = mobileDeveloperApiContext({ requireTextChannel: true })
    if (!context || !context.channelId) {
      return
    }

    const name = developerWebhookName.trim()
    if (!name) {
      setDeveloperFeedback('Webhook name is required.')
      return
    }

    setDeveloperStatus('loading')
    try {
      const created = await context.client.createIncomingWebhook(context.channelId, { name })
      Clipboard.setString(created.executeUrl || created.token)
      upsertMobileIncomingWebhook(context.channelId, incomingWebhookDetailFromShownToken(created))
      setDeveloperWebhookName('')
      setDeveloperFeedback(
        `Webhook URL copied. Last four: ${lastFourSecretLabel(created.tokenLastFour)}.`,
      )
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to create incoming webhook.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function rotateMobileDeveloperWebhookToken(webhookId: string) {
    const context = mobileDeveloperApiContext({ requireTextChannel: true })
    if (!context || !context.channelId) {
      return
    }

    setDeveloperStatus('loading')
    try {
      const rotated = await context.client.rotateIncomingWebhookToken(
        context.channelId,
        webhookId,
      )
      Clipboard.setString(rotated.executeUrl || rotated.token)
      upsertMobileIncomingWebhook(context.channelId, incomingWebhookDetailFromShownToken(rotated))
      setDeveloperFeedback(
        `Webhook URL copied. Last four: ${lastFourSecretLabel(rotated.tokenLastFour)}.`,
      )
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to rotate webhook token.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function deleteMobileDeveloperWebhook(webhookId: string) {
    const context = mobileDeveloperApiContext({ requireTextChannel: true })
    if (!context || !context.channelId) {
      return
    }

    setDeveloperStatus('loading')
    try {
      await context.client.deleteIncomingWebhook(context.channelId, webhookId)
      removeMobileIncomingWebhook(context.channelId, webhookId)
      setDeveloperFeedback('Incoming webhook deleted.')
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to delete incoming webhook.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function loadMobileDeveloperAuditEvents() {
    const context = mobileDeveloperApiContext({ requireSpace: true })
    if (!context) {
      return
    }

    setDeveloperStatus('loading')
    try {
      const auditEvents = await context.client.listSpaceAuditEvents(context.spaceId)
      setMobileAuditEvents(context.spaceId, auditEvents)
      setDeveloperFeedback(`Loaded ${auditEvents.length} audit event${auditEvents.length === 1 ? '' : 's'}.`)
    } catch (error) {
      setDeveloperFeedback(errorMessage(error, 'Unable to load audit events.'))
    } finally {
      setDeveloperStatus('idle')
    }
  }

  async function openMobileCalendarPanel() {
    setMeetingPanelOpen(true)
    setSettingsOpen(false)
    setServerManagerOpen(false)

    if (!state.sessionToken) {
      return
    }

    const organizationId = meetingOrganizationIdFromMobileChannels(state.channels)
    if (!organizationId) {
      setMeetingFeedback('Meetings need an organization context before sync.')
      return
    }

    const client = createOpenCordApiClient({
      baseUrl: state.serverUrl,
      sessionToken: state.sessionToken,
    })
    await refreshMobileMeetings(client, state.channels)
    const refreshedMeetings = useMobileMeetingsStore.getState()
    if (!refreshedMeetings.selectedMeetingId && refreshedMeetings.meetings[0]) {
      openMobileMeetingDetail(refreshedMeetings.meetings[0])
    }
  }

  function startCreateMobileMeeting() {
    const startsAt = defaultMeetingLocalDateTime()
    openMobileMeetingCreateForm({
      channelId: activeChannel.kind === 'text' ? activeChannel.id : null,
      defaultEndsAt: addMinutesToLocalDateTime(startsAt, 30),
      defaultStartsAt: startsAt,
      organizationId:
        activeChannel.organizationId ??
        meetingOrganizationIdFromMobileChannels(state.channels) ??
        undefined,
      spaceId: activeChannel.spaceId ?? DEFAULT_MOBILE_SPACE_ID,
    })
    setMeetingPanelOpen(true)
    setMeetingFeedback(null)
  }

  function openMobileMeetingDetail(meeting: Meeting) {
    selectMobileMeeting(meeting.id)
    setMeetingPanelOpen(true)
    setMeetingFeedback(null)
    setMobileRouteTarget({
      kind: 'meeting',
      serverId: activeServer?.id,
      organizationId: meeting.organizationId,
      spaceId: meeting.spaceId ?? undefined,
      channelId: meeting.channelId ?? undefined,
      meetingId: meeting.id,
    })
  }

  async function saveMobileMeetingForm() {
    const form = useMobileMeetingsStore.getState().form
    if (!form) {
      return
    }

    const title = form.title.trim()
    if (!title) {
      setMeetingFeedback('Meeting title is required.')
      return
    }

    const startsAt = localDateTimeToIso(form.startsAt)
    const endsAt = localDateTimeToIso(form.endsAt)
    if (!startsAt || !endsAt) {
      setMeetingFeedback('Use valid start and end times.')
      return
    }

    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setMeetingFeedback('End time must be after start time.')
      return
    }

    try {
      const client = state.sessionToken
        ? createOpenCordApiClient({
            baseUrl: state.serverUrl,
            sessionToken: state.sessionToken,
          })
        : null
      const savedMeeting =
        form.mode === 'edit' && form.meetingId
          ? await saveMobileMeetingEdit(client, form, startsAt, endsAt, title)
          : await saveMobileMeetingCreate(client, form, startsAt, endsAt, title)
      upsertMobileMeeting(savedMeeting)
      setMobileMeetingLocalReminder(savedMeeting.id, {
        channel: form.reminderChannel,
        offsetMinutes: form.reminderOffsetMinutes,
      })
      selectMobileMeeting(savedMeeting.id)
      closeMobileMeetingForm()
      setMeetingFeedback(null)
    } catch (error) {
      setMeetingFeedback(errorMessage(error, 'Unable to save meeting.'))
    }
  }

  async function saveMobileMeetingCreate(
    client: ReturnType<typeof createOpenCordApiClient> | null,
    form: MobileMeetingForm,
    startsAt: string,
    endsAt: string,
    title: string,
  ) {
    const organizationId =
      form.organizationId ?? meetingOrganizationIdFromMobileChannels(state.channels)
    if (client && organizationId) {
      return client.createMeeting(organizationId, {
        channelId: form.channelId,
        endsAt,
        reminders: mobileMeetingRemindersForForm(form, state.account?.email),
        spaceId: form.spaceId,
        startsAt,
        timezone: resolvedTimeZone(),
        title,
      })
    }

    return localMobileMeetingFromForm(form, {
      email: state.account?.email,
      endsAt,
      serverUrl: state.serverUrl,
      startsAt,
      title,
    })
  }

  async function saveMobileMeetingEdit(
    client: ReturnType<typeof createOpenCordApiClient> | null,
    form: MobileMeetingForm,
    startsAt: string,
    endsAt: string,
    title: string,
  ) {
    const existing = meetings.find((meeting) => meeting.id === form.meetingId)
    if (client && form.meetingId && isServerBackedId(form.meetingId)) {
      return client.updateMeeting(form.meetingId, {
        endsAt,
        startsAt,
        timezone: resolvedTimeZone(),
        title,
      })
    }

    return {
      ...(existing ?? localMobileMeetingFromForm(form, {
        email: state.account?.email,
        endsAt,
        serverUrl: state.serverUrl,
        startsAt,
        title,
      })),
      endsAt,
      startsAt,
      title,
      timezone: resolvedTimeZone(),
    }
  }

  async function cancelMobileMeeting(meeting: Meeting) {
    try {
      const client =
        state.sessionToken && isServerBackedId(meeting.id)
          ? createOpenCordApiClient({
              baseUrl: state.serverUrl,
              sessionToken: state.sessionToken,
            })
          : null
      const cancelledMeeting = client
        ? await client.cancelMeeting(meeting.id)
        : {
            ...meeting,
            cancelledAt: new Date().toISOString(),
            status: 'cancelled',
          }
      upsertMobileMeeting(cancelledMeeting)
      setMeetingFeedback(null)
    } catch (error) {
      setMeetingFeedback(errorMessage(error, 'Unable to cancel meeting.'))
    }
  }

  function copyMeetingJoinUrl(meeting: Meeting) {
    Clipboard.setString(meeting.joinUrl)
    setMeetingFeedback('Meeting join URL copied.')
  }

  function openMeetingJoinUrl(meeting: Meeting) {
    void Linking.openURL(meeting.joinUrl)
  }

  function copyMeetingCalendarUrl(meeting: Meeting) {
    const client = createOpenCordApiClient({
      baseUrl: state.serverUrl,
      sessionToken: state.sessionToken ?? undefined,
    })
    Clipboard.setString(client.meetingInviteIcsUrl(meeting.id))
    setMeetingFeedback('Calendar invite URL copied.')
  }

  function openMeetingCalendarUrl(meeting: Meeting) {
    const client = createOpenCordApiClient({
      baseUrl: state.serverUrl,
      sessionToken: state.sessionToken ?? undefined,
    })
    void Linking.openURL(client.meetingInviteIcsUrl(meeting.id))
  }

  function handleIncomingUrl(url: string) {
    const normalizedUrl = url.trim()
    if (!normalizedUrl || lastHandledIncomingUrlRef.current === normalizedUrl) {
      return
    }

    lastHandledIncomingUrlRef.current = normalizedUrl
    const e2eCommand = e2eLaunchConfig ? mobileE2ECommandFromUrl(normalizedUrl) : null
    if (e2eCommand) {
      runMobileE2ECommand(e2eCommand)
      return
    }

    if (openMobileNotificationRouteFromUrl(normalizedUrl)) {
      return
    }

    openMobileMeetingFromUrl(normalizedUrl)
  }

  function openMobileNotificationRouteFromUrl(url: string) {
    const routeTarget = mobileNotificationRouteTargetFromUrl(url)
    if (!routeTarget) {
      return false
    }

    routeMobileNotificationTarget(routeTarget)
    return true
  }

  function routeMobileNotificationTarget(routeTarget: OpenCordNotificationRouteTarget) {
    setMobileRouteTarget(routeTarget)
    setSettingsOpen(false)
    setMemberDrawerOpen(false)
    setSearchOpen(false)

    switch (routeTarget.kind) {
      case 'server':
        setNotificationRouteStatus(`Opened server ${shortIdentifier(routeTarget.serverId)}.`)
        setChatFeedback('Opened notification server route.')
        return
      case 'channel': {
        const channel = stateRef.current.channels.find(
          (candidate) => candidate.id === routeTarget.channelId,
        )
        if (channel) {
          dispatch({ type: 'channel.select', channelId: channel.id })
          setNotificationRouteStatus(`Opened #${channel.name}.`)
          setChatFeedback(`Opened notification for #${channel.name}.`)
          return
        }

        setNotificationRouteStatus(`Channel ${shortIdentifier(routeTarget.channelId)} not synced.`)
        setChatFeedback('Notification channel is not synced on this device yet.')
        return
      }
      case 'message': {
        const message = stateRef.current.messages.find(
          (candidate) => candidate.id === routeTarget.messageId,
        )
        if (message) {
          dispatch({ type: 'channel.select', channelId: message.channelId })
          setHighlightedMessageId(message.id)
          setNotificationRouteStatus(`Opened message ${shortIdentifier(message.id)}.`)
          setChatFeedback('Opened notification message.')
          return
        }

        setNotificationRouteStatus(`Message ${shortIdentifier(routeTarget.messageId)} not synced.`)
        setChatFeedback('Notification message is not synced on this device yet.')
        return
      }
      case 'meeting': {
        const meeting = useMobileMeetingsStore
          .getState()
          .meetings.find((candidate) => candidate.id === routeTarget.meetingId)
        if (meeting) {
          openMobileMeetingDetail(meeting)
          setNotificationRouteStatus(`Opened meeting ${meeting.title}.`)
          return
        }

        setMeetingPanelOpen(true)
        setMeetingFeedback('Meeting notification received. Sync meetings to finish routing.')
        setNotificationRouteStatus(`Meeting ${shortIdentifier(routeTarget.meetingId)} not synced.`)
        return
      }
    }
  }

  function openMobileMeetingFromUrl(url: string) {
    const meetingId = mobileMeetingIdFromUrl(url)
    const meeting = useMobileMeetingsStore
      .getState()
      .meetings.find(
        (candidate) =>
          (meetingId && candidate.id === meetingId) ||
          candidate.joinUrl.trim() === url.trim(),
      )

    if (!meeting) {
      if (meetingId) {
        pendingMeetingDeepLinkRef.current = url
        setMeetingPanelOpen(true)
        setMeetingFeedback('Meeting link received. Sync meetings to finish routing.')
        return true
      }

      return false
    }

    pendingMeetingDeepLinkRef.current = null
    openMobileMeetingDetail(meeting)
    return true
  }

  async function pickMobileAttachments() {
    if (editTarget) {
      setChatFeedback('Save the edit before adding attachments.')
      return
    }

    try {
      const picked = await pick({
        allowMultiSelection: true,
        mode: 'import',
        type: [documentPickerTypes.allFiles],
      })
      if (picked.length === 0) {
        return
      }

      const copies = await keepLocalCopy({
        destination: 'cachesDirectory',
        files: picked.map((file) => ({
          fileName: file.name ?? fallbackAttachmentFileName(file),
          uri: file.uri,
        })) as [{ fileName: string; uri: string }, ...Array<{ fileName: string; uri: string }>],
      })
      const attachments = picked.map((file, index) => {
        const copy = copies[index]
        return mobilePendingAttachmentFromPickerFile(
          file,
          copy?.status === 'success' ? copy.localUri : file.uri,
          index,
        )
      })

      setMobilePendingAttachments(state.selectedChannelId, [
        ...pendingAttachments,
        ...attachments,
      ])
      setChatFeedback(null)
    } catch (error) {
      if (
        isDocumentPickerErrorWithCode(error) &&
        error.code === documentPickerErrorCodes.OPERATION_CANCELED
      ) {
        return
      }

      setChatFeedback(errorMessage(error, 'Attachment picker is unavailable.'))
    }
  }

  function removePendingAttachment(attachmentId: string) {
    setMobilePendingAttachments(
      state.selectedChannelId,
      pendingAttachments.filter((attachment) => attachment.id !== attachmentId),
    )
  }

  async function retryPendingAttachmentUpload(attachmentId: string) {
    const uploaded = await uploadPendingAttachments(state.selectedChannelId, { attachmentId })
    if (uploaded) {
      setChatFeedback(null)
    }
  }

  function updatePendingAttachment(
    channelId: string,
    attachmentId: string,
    patch: Partial<MobilePendingAttachment>,
  ) {
    const currentAttachments =
      useMobileChatStore.getState().pendingAttachmentsByChannelId[channelId] ?? []
    setMobilePendingAttachments(
      channelId,
      currentAttachments.map((attachment) =>
        attachment.id === attachmentId ? { ...attachment, ...patch } : attachment,
      ),
    )
  }

  function openMobileChannel(channel: Pick<MobileChannel, 'id' | 'kind'>) {
    const routeTarget = mobileRouteTargetForChannel(state, channel.id)
    if (routeTarget) {
      setMobileRouteTarget(routeTarget)
    }

    if (channel.kind === 'voice') {
      void joinMobileVoice(channel.id)
      return
    }

    dispatch({ type: 'channel.select', channelId: channel.id })
  }

  function openMobileSearch() {
    setMemberDrawerOpen(false)
    setSearchOpen((current) => !current)
  }

  function openMobileMembers() {
    setSearchOpen(false)
    setMemberDrawerOpen((current) => !current)
  }

  function jumpToMobileMessage(messageId: string) {
    const message = state.messages.find((candidate) => candidate.id === messageId)
    if (!message) {
      setChatFeedback('Message is no longer available.')
      return
    }

    const routeTarget = mobileRouteTargetForMessage(state, messageId)
    if (routeTarget) {
      setMobileRouteTarget(routeTarget)
    }
    dispatch({ type: 'channel.select', channelId: message.channelId })
    setHighlightedMessageId(messageId)
    setMemberDrawerOpen(false)
    setSearchOpen(false)
    setChatFeedback(`Jumped to #${state.channels.find((channel) => channel.id === message.channelId)?.name ?? 'channel'}.`)
  }

  function runLocalNotificationRouteHarness() {
    const routeTarget = mobileNotificationTargetForCurrentContext(state)
    if (!routeTarget) {
      setNotificationRouteStatus('No routeable channel or message is available.')
      return
    }

    const notificationLink = buildOpenCordNotificationDeepLink(routeTarget)
    const separator = notificationLink.includes('?') ? '&' : '?'
    handleIncomingUrl(`${notificationLink}${separator}tapId=${Date.now()}`)
  }

  function toggleVoiceSettings() {
    openMobileSettingsPanel('voice-video')
    setSettingsOpen((current) => !current)
  }

  async function sendMessage() {
    if (!composerUi.canSend) {
      return
    }

    if (editTarget?.messageId) {
      dispatch({
        type: 'message.edit',
        messageId: editTarget.messageId,
        content: composerText,
      })
    } else {
      const attachments = await uploadPendingAttachments(state.selectedChannelId)
      if (!attachments) {
        return
      }
      dispatch({
        type: 'message.send',
        attachments,
        content: composerText,
        replyToMessageId: replyTarget?.messageId,
      })
    }
    clearMobileComposer(state.selectedChannelId)
    clearMobileDraftTarget()
    setChatFeedback(null)
  }

  async function uploadPendingAttachments(
    channelId: string,
    options: { attachmentId?: string } = {},
  ): Promise<MobileMessageAttachment[] | null> {
    const attachments = (pendingAttachmentsByChannelId[channelId] ?? []).filter(
      (attachment) => !options.attachmentId || attachment.id === options.attachmentId,
    )
    if (attachments.length === 0) {
      return []
    }
    if (!state.sessionToken) {
      setChatFeedback('Sign in before sending attachments.')
      return null
    }

    const client = createOpenCordApiClient({
      baseUrl: state.serverUrl,
      sessionToken: state.sessionToken,
    })
    const uploadedAttachments: MobileMessageAttachment[] = []

    for (const attachment of attachments) {
      if (
        attachment.uploadStatus === 'uploaded' &&
        attachment.attachmentId &&
        attachment.downloadUrl
      ) {
        uploadedAttachments.push(mobileMessageAttachmentFromPendingAttachment(attachment))
        continue
      }

      try {
        updatePendingAttachment(channelId, attachment.id, {
          errorMessage: undefined,
          uploadProgress: 0.15,
          uploadStatus: 'uploading',
        })
        const presign = await client.presignAttachment({
          channelId,
          contentType: attachment.contentType,
          fileName: attachment.fileName,
          sizeBytes: attachment.sizeBytes,
        })
        updatePendingAttachment(channelId, attachment.id, {
          attachmentId: presign.attachment.id,
          uploadProgress: 0.45,
        })
        const body = await mobileAttachmentBody(attachment.localUri)
        const uploaded = await client.uploadAttachmentContent(
          presign.attachment.id,
          body,
          attachment.contentType,
        )
        updatePendingAttachment(channelId, attachment.id, {
          attachmentId: uploaded.id,
          downloadUrl: uploaded.downloadUrl,
          uploadProgress: 1,
          uploadStatus: 'uploaded',
        })
        uploadedAttachments.push(mobileMessageAttachmentFromApiAttachment(uploaded))
      } catch (error) {
        updatePendingAttachment(channelId, attachment.id, {
          errorMessage: errorMessage(error, 'Unable to upload attachment.'),
          uploadStatus: 'failed',
        })
        setChatFeedback(errorMessage(error, 'Unable to upload attachment.'))
        return null
      }
    }

    return uploadedAttachments
  }

  function handleMessageAction(actionId: MobileMessageActionId, message: MobileMessage) {
    const target = { channelId: message.channelId, messageId: message.id }

    switch (actionId) {
      case 'reply':
        beginMobileReply(target)
        setChatFeedback(null)
        break
      case 'edit':
        if (message.own && !message.deleted) {
          beginMobileEdit(target)
          setMobileComposerText(message.channelId, message.content)
          setChatFeedback(null)
        }
        break
      case 'delete':
        dispatch({ type: 'message.delete', messageId: message.id })
        clearMobileDraftTarget()
        setChatFeedback('Message deleted.')
        break
      case 'copy':
        Clipboard.setString(message.content)
        setChatFeedback('Message text copied.')
        break
      case 'pin':
        dispatch({ type: 'message.pin', messageId: message.id, pinned: !message.pinned })
        setChatFeedback(message.pinned ? 'Message unpinned.' : 'Message pinned.')
        break
      case 'react':
        dispatch({ type: 'message.react', messageId: message.id, emoji: '✅' })
        setChatFeedback('Reaction added.')
        break
      case 'report':
        setChatFeedback('Report saved for moderation review.')
        break
    }

    openMobileMessageActions(null)
  }

  async function requestPermission(kind: MobileMediaPermissionKind) {
    const status = await requestNativeMediaPermission(kind)
    dispatch({ type: 'permission.updated', kind, status })
  }

  async function joinMobileVoice(channelId: string) {
    if (state.mediaPermissions.microphone !== 'granted') {
      const status = await requestNativeMediaPermission('microphone')
      dispatch({ type: 'permission.updated', kind: 'microphone', status })
      if (status !== 'granted') {
        dispatch({ type: 'voice.join', channelId })
        return
      }
    }
    if (!state.sessionToken) {
      dispatch({ type: 'voice.media_failed', message: 'Sign in before joining voice.' })
      return
    }

    await voiceSessionRef.current?.disconnect()
    voiceSessionRef.current = null
    dispatch({ type: 'voice.media_connecting', channelId })

    try {
      const client = createOpenCordApiClient({
        baseUrl: state.serverUrl,
        sessionToken: state.sessionToken,
      })
      const joined = await client.joinVoiceChannel(channelId, {
        selfDeaf: state.voice.selfDeaf,
        selfMute: state.voice.selfMute,
      })
      const session = await connectNativeLiveKitVoice({
        callDisplayName: state.channels.find((channel) => channel.id === channelId)?.name ?? 'OpenCord voice',
        media: joined.media,
        selfDeaf: state.voice.selfDeaf,
        selfMute: state.voice.selfMute,
        onNativeCallEnded: () => {
          voiceSessionRef.current = null
          dispatch({ type: 'voice.leave' })
        },
        onStateChange: (mediaState) => {
          dispatch({
            type: 'voice.remote_screen_shares_updated',
            streams: mediaState.remoteScreenShareStreams,
          })
        },
      })
      voiceSessionRef.current = session
      dispatch({
        type: 'voice.media_connected',
        channelId,
        media: {
          roomName: joined.media.roomName,
          participantIdentity: joined.media.participantIdentity,
          canPublishAudio: joined.media.grants.canPublishAudio,
          canPublishScreen: joined.media.grants.canPublishScreen,
          canSubscribe: joined.media.grants.canSubscribe,
          remoteScreenShares: session.snapshot().remoteScreenShares,
          remoteScreenShareStreams: session.snapshot().remoteScreenShareStreams,
        },
      })
    } catch (error) {
      dispatch({ type: 'voice.media_failed', message: errorMessage(error, 'Unable to join voice.') })
    }
  }

  async function joinMobileMeeting(meetingId: string, meetingTitle: string) {
    if (state.mediaPermissions.microphone !== 'granted') {
      const status = await requestNativeMediaPermission('microphone')
      dispatch({ type: 'permission.updated', kind: 'microphone', status })
      if (status !== 'granted') {
        dispatch({ type: 'voice.media_failed', message: 'Microphone permission is required before joining meeting.' })
        return
      }
    }
    if (!state.sessionToken) {
      dispatch({ type: 'voice.media_failed', message: 'Sign in before joining meeting.' })
      return
    }

    await voiceSessionRef.current?.disconnect()
    voiceSessionRef.current = null
    dispatch({ type: 'voice.media_connecting', channelId: meetingId, displayName: meetingTitle })

    try {
      const client = createOpenCordApiClient({
        baseUrl: state.serverUrl,
        sessionToken: state.sessionToken,
      })
      const media = await client.createMeetingMediaToken(meetingId, {
        canPublishAudio: true,
        canSubscribe: true,
      })
      const session = await connectNativeLiveKitVoice({
        callDisplayName: meetingTitle,
        media,
        selfDeaf: state.voice.selfDeaf,
        selfMute: state.voice.selfMute,
        onNativeCallEnded: () => {
          voiceSessionRef.current = null
          dispatch({ type: 'voice.leave' })
        },
        onStateChange: (mediaState) => {
          dispatch({
            type: 'voice.remote_screen_shares_updated',
            streams: mediaState.remoteScreenShareStreams,
          })
        },
      })
      voiceSessionRef.current = session
      dispatch({
        type: 'voice.media_connected',
        channelId: meetingId,
        media: {
          displayName: meetingTitle,
          roomName: media.roomName,
          participantIdentity: media.participantIdentity,
          canPublishAudio: media.grants.canPublishAudio,
          canPublishScreen: media.grants.canPublishScreen,
          canSubscribe: media.grants.canSubscribe,
          remoteScreenShares: session.snapshot().remoteScreenShares,
          remoteScreenShareStreams: session.snapshot().remoteScreenShareStreams,
        },
      })
    } catch (error) {
      dispatch({ type: 'voice.media_failed', message: errorMessage(error, 'Unable to join meeting.') })
    }
  }

  function toggleMute() {
    const nextMuted = !state.voice.selfMute
    dispatch({ type: 'voice.toggle_mute' })
    void voiceSessionRef.current?.setMuted(nextMuted)
  }

  function toggleDeaf() {
    const nextDeafened = !state.voice.selfDeaf
    dispatch({ type: 'voice.toggle_deaf' })
    void voiceSessionRef.current?.setDeafened(nextDeafened)
    if (nextDeafened) {
      void voiceSessionRef.current?.setMuted(true)
    }
  }

  async function leaveVoice() {
    await voiceSessionRef.current?.disconnect()
    voiceSessionRef.current = null
    dispatch({ type: 'voice.leave' })
  }

  function handleMobileRealtimeEvent(event: RealtimeIncomingEnvelope) {
    if (event.type === 'message.created') {
      dispatch({ type: 'realtime.message_created', envelope: event })
      return
    }
    if (event.type !== 'media.permission_revoked') {
      return
    }

    applyNativeMediaPermissionSideEffects(event)
    dispatch({ type: 'realtime.media_permission_revoked', envelope: event })
  }

  function applyNativeMediaPermissionSideEffects(event: RealtimeIncomingEnvelope) {
    if (!('data' in event)) {
      return
    }

    const current = stateRef.current
    const data = mobileRealtimeRecord(event.data)
    const grants = mobileRealtimeRecord(data.grants)
    const targetId = mobileRealtimeString(data.target_id)
    const channelId = mobileRealtimeString(data.channel_id) ?? event.scope.channel_id
    if (
      !current.voice.media ||
      !current.voice.connectedChannelId ||
      channelId !== current.voice.connectedChannelId ||
      mobileRealtimeString(data.target_kind) !== 'member' ||
      targetId !== current.voice.media.participantIdentity
    ) {
      return
    }

    if (data.action === 'disconnect' || grants.can_subscribe === false) {
      void voiceSessionRef.current?.disconnect()
      voiceSessionRef.current = null
      return
    }
    if (grants.can_publish_audio === false) {
      void voiceSessionRef.current?.setMuted(true)
    }
  }

  function runMobileE2ECommand(command: MobileE2ECommand | null) {
    switch (command) {
      case 'mute':
        toggleMute()
        break
      case 'deaf':
        toggleDeaf()
        break
      case 'leave':
        void leaveVoice()
        break
      case null:
        break
    }
  }

  if (state.screen === 'login') {
    return (
      <View style={shellStyle}>
        <StatusBar backgroundColor="#151515" barStyle="light-content" />
        <View style={loginPanelStyle}>
          <Text style={styles.brand}>OpenCord</Text>
          <Text style={styles.subtle}>Connect to OpenCord Cloud or a self-hosted server.</Text>
          <TextInput
            accessibilityLabel="Server URL"
            autoCapitalize="none"
            inputMode="url"
            onChangeText={setServerUrl}
            style={styles.input}
            value={serverUrl}
          />
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            inputMode="email"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="#7f877d"
            style={styles.input}
            value={email}
          />
          <TextInput
            accessibilityLabel="Password"
            autoCapitalize="none"
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="#7f877d"
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <View style={styles.rememberDeviceRow}>
            <View style={styles.rememberDeviceCopy}>
              <Text style={styles.rememberDeviceLabel}>Remember this device</Text>
              <Text style={styles.subtle}>Reopen without logging in on this phone.</Text>
            </View>
            <Switch
              accessibilityLabel="Remember this device"
              accessibilityRole="switch"
              ios_backgroundColor="#4a514c"
              onValueChange={setRememberDevice}
              thumbColor={rememberDevice ? '#e9fffa' : '#f5f6f3'}
              trackColor={REMEMBER_DEVICE_SWITCH_TRACK_COLOR}
              value={rememberDevice}
            />
          </View>
          {loginError ? <Text style={styles.errorText}>{loginError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={loginStatus === 'loading'}
            onPress={() => {
              void submitLogin()
            }}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>
              {loginStatus === 'loading' ? 'Logging in' : 'Log in'}
            </Text>
          </Pressable>
          <View style={styles.serverList}>
            {state.serverConnections.connections.map((connection) => (
              <View key={connection.id} style={styles.serverRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => switchServer(connection.id)}
                  style={[
                    styles.serverSwitchButton,
                    connection.id === state.serverConnections.activeConnectionId
                      ? styles.activeServerSwitchButton
                      : null,
                  ]}
                >
                  <Text style={styles.serverName}>{connection.displayName}</Text>
                  <Text style={styles.subtle}>{connection.baseUrl}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => dispatch({ type: 'server.remove', connectionId: connection.id })}
                  style={styles.removeServerButton}
                >
                  <Text style={styles.primaryButtonText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      </View>
    )
  }

  if (state.screen === 'channels') {
    return (
      <View style={shellStyle}>
        <StatusBar backgroundColor="#151515" barStyle="light-content" />
        <View style={styles.mobileWorkspace}>
          <ServerRail
            activeConnectionId={state.serverConnections.activeConnectionId}
            connections={state.serverConnections.connections}
            onOpenManager={() => setServerManagerOpen((current) => !current)}
            onSwitchServer={switchServer}
          />
          <View style={styles.channelDrawer}>
            <View style={styles.drawerHeader}>
              <View style={styles.drawerTitleBlock}>
                <Text numberOfLines={1} style={styles.title}>
                  {activeServer?.displayName ?? 'OpenCord'}
                </Text>
                <Text numberOfLines={1} style={styles.subtle}>
                  {state.serverUrl.replace(/^https?:\/\//, '')}
                </Text>
              </View>
              <View style={styles.drawerHeaderActions}>
                <Text style={styles.status}>{state.realtimeStatus}</Text>
                <Pressable
                  accessibilityLabel="Open voice and video settings"
                  accessibilityRole="button"
                  hitSlop={4}
                  onPress={toggleVoiceSettings}
                  style={styles.drawerIconButton}
                >
                  <Text
                    allowFontScaling={false}
                    maxFontSizeMultiplier={1}
                    style={styles.iconOnlyButtonText}
                  >
                    ⚙
                  </Text>
                </Pressable>
              </View>
            </View>
            {serverManagerOpen ? (
              <ServerManagementSheet
                activeConnectionId={state.serverConnections.activeConnectionId}
                onAddServer={addServerConnection}
                onClose={() => setServerManagerOpen(false)}
                onRemoveServer={(connectionId) => dispatch({ type: 'server.remove', connectionId })}
                onServerUrlChange={setServerUrl}
                serverUrl={serverUrl}
              />
            ) : null}
            {settingsOpen ? (
              <MobileSettingsPanel
                accountName={state.account?.displayName ?? 'OpenCord'}
                activePanel={activeSettingsPanel}
                auditEvents={developerAuditEvents}
                botApplications={mobileBotApplications}
                developerBotName={developerBotName}
                developerChannelId={developerChannelId}
                developerChannelName={developerTextChannel?.name ?? 'No text channel'}
                developerFeedback={developerFeedback}
                developerOrganizationId={developerOrganizationId}
                developerSpaceId={developerSpaceId}
                developerStatus={developerStatus}
                developerWebhookName={developerWebhookName}
                email={state.account?.email ?? 'Not signed in'}
                feedback={settingsFeedback}
                hasSavedDeviceSession={activeDeviceSessionSaved}
                logoutStatus={logoutStatus}
                maxHeight={permissionPanelMaxHeight}
                notificationRouteStatus={notificationRouteStatus}
                onClearSavedLogin={() => {
                  void clearSavedMobileLogin()
                }}
                onClose={() => setSettingsOpen(false)}
                onLogout={() => {
                  void logoutMobileSession()
                }}
                onBotNameChange={setDeveloperBotName}
                onCreateBot={() => {
                  void createMobileDeveloperBot()
                }}
                onCreateWebhook={() => {
                  void createMobileDeveloperWebhook()
                }}
                onDeleteWebhook={(webhookId) => {
                  void deleteMobileDeveloperWebhook(webhookId)
                }}
                onInviteBot={(applicationId) => {
                  void inviteMobileDeveloperBot(applicationId)
                }}
                onLoadAuditEvents={() => {
                  void loadMobileDeveloperAuditEvents()
                }}
                onLoadBots={() => {
                  void loadMobileDeveloperBots()
                }}
                onLoadWebhooks={() => {
                  void loadMobileDeveloperWebhooks()
                }}
                onOpenSettings={openNativePermissionSettings}
                onRequest={requestPermission}
                onRotateBotToken={(applicationId) => {
                  void rotateMobileDeveloperBotToken(applicationId)
                }}
                onRotateWebhookToken={(webhookId) => {
                  void rotateMobileDeveloperWebhookToken(webhookId)
                }}
                onSelectPanel={openMobileSettingsPanel}
                onTestNotificationRoute={runLocalNotificationRouteHarness}
                onWebhookNameChange={setDeveloperWebhookName}
                rows={permissionRows}
                serverUrl={state.serverUrl}
                webhooks={developerWebhooks}
              />
            ) : null}
            {state.voice.errorMessage ? (
              <Text style={styles.inlineError}>{state.voice.errorMessage}</Text>
            ) : null}
            <View style={styles.drawerQuickActions}>
              <Pressable
                accessibilityLabel="Open calendar"
                accessibilityRole="button"
                onPress={() => {
                  void openMobileCalendarPanel()
                }}
                style={[
                  styles.drawerQuickActionButton,
                  meetingPanelOpen ? styles.activeDrawerQuickActionButton : null,
                ]}
              >
                <Text style={styles.drawerQuickActionIcon}>▣</Text>
                <Text style={styles.drawerQuickActionText}>Calendar</Text>
              </Pressable>
              {meetingPanelOpen ? (
                <Pressable
                  accessibilityLabel="Close calendar"
                  accessibilityRole="button"
                  onPress={() => setMeetingPanelOpen(false)}
                  style={styles.drawerQuickActionButton}
                >
                  <Text style={styles.drawerQuickActionIcon}>×</Text>
                  <Text style={styles.drawerQuickActionText}>Close</Text>
                </Pressable>
              ) : null}
            </View>
            {meetingPanelOpen ? (
              <MobileMeetingPanel
                activeVoiceMeetingId={state.voice.connectedChannelId}
                channels={state.channels}
                feedback={meetingFeedback}
                form={meetingForm}
                localRemindersByMeetingId={localMeetingReminders}
                meetings={meetings}
                onCancelMeeting={(meeting) => {
                  void cancelMobileMeeting(meeting)
                }}
                onCloseForm={closeMobileMeetingForm}
                onCopyCalendarUrl={copyMeetingCalendarUrl}
                onCopyJoinUrl={copyMeetingJoinUrl}
                onEditMeeting={openMobileMeetingEditForm}
                onFieldChange={setMobileMeetingFormField}
                onJoinMeeting={(meeting) => {
                  void joinMobileMeeting(meeting.id, meeting.title)
                }}
                onLeaveMeeting={leaveVoice}
                onOpenCalendarUrl={openMeetingCalendarUrl}
                onOpenJoinUrl={openMeetingJoinUrl}
                onSaveForm={() => {
                  void saveMobileMeetingForm()
                }}
                onSelectMeeting={openMobileMeetingDetail}
                onStartCreate={startCreateMobileMeeting}
                selectedMeeting={selectedMeeting}
              />
            ) : null}
            <WorkspaceNavigator
              onChannelPress={openMobileChannel}
              sections={workspaceSections}
            />
            <MobileVoiceTray
              channelName={activeVoiceRoomName}
              canListen={mobileCanListenToVoice(state)}
              canSpeak={mobileCanSpeakInVoice(state)}
              participants={voiceParticipants}
              remoteScreenShares={state.voice.media?.remoteScreenShares ?? 0}
              remoteScreenShareStreams={state.voice.media?.remoteScreenShareStreams ?? []}
              selfDeaf={state.voice.selfDeaf}
              selfMute={state.voice.selfMute}
              status={state.voice.connectionStatus}
              errorMessage={state.voice.errorMessage}
              onLeave={leaveVoice}
              onToggleDeaf={toggleDeaf}
              onToggleMute={toggleMute}
            />
            <MobileAccountBar
              accountName={state.account?.displayName ?? 'OpenCord'}
              email={state.account?.email ?? activeServer?.baseUrl ?? state.serverUrl}
              onOpenSettings={() => {
                openMobileSettingsPanel('account')
                setSettingsOpen(true)
              }}
              onToggleDeaf={toggleDeaf}
              onToggleMute={toggleMute}
              selfDeaf={state.voice.selfDeaf}
              selfMute={state.voice.selfMute}
              voiceConnected={Boolean(state.voice.connectedChannelId)}
            />
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={shellStyle}>
      <StatusBar backgroundColor="#151515" barStyle="light-content" />
      <MobileChatHeader
        channel={activeChannel}
        memberDrawerOpen={memberDrawerOpen}
        onBack={() => dispatch({ type: 'channel.back' })}
        onOpenMembers={openMobileMembers}
        onOpenSearch={openMobileSearch}
        onOpenSettings={() => {
          openMobileSettingsPanel('account')
          setSettingsOpen(true)
        }}
        searchOpen={searchOpen}
      />
      {settingsOpen ? (
        <MobileSettingsPanel
          accountName={state.account?.displayName ?? 'OpenCord'}
          activePanel={activeSettingsPanel}
          auditEvents={developerAuditEvents}
          botApplications={mobileBotApplications}
          developerBotName={developerBotName}
          developerChannelId={developerChannelId}
          developerChannelName={developerTextChannel?.name ?? 'No text channel'}
          developerFeedback={developerFeedback}
          developerOrganizationId={developerOrganizationId}
          developerSpaceId={developerSpaceId}
          developerStatus={developerStatus}
          developerWebhookName={developerWebhookName}
          email={state.account?.email ?? 'Not signed in'}
          feedback={settingsFeedback}
          hasSavedDeviceSession={activeDeviceSessionSaved}
          logoutStatus={logoutStatus}
          maxHeight={permissionPanelMaxHeight}
          notificationRouteStatus={notificationRouteStatus}
          onClearSavedLogin={() => {
            void clearSavedMobileLogin()
          }}
          onClose={() => setSettingsOpen(false)}
          onLogout={() => {
            void logoutMobileSession()
          }}
          onBotNameChange={setDeveloperBotName}
          onCreateBot={() => {
            void createMobileDeveloperBot()
          }}
          onCreateWebhook={() => {
            void createMobileDeveloperWebhook()
          }}
          onDeleteWebhook={(webhookId) => {
            void deleteMobileDeveloperWebhook(webhookId)
          }}
          onInviteBot={(applicationId) => {
            void inviteMobileDeveloperBot(applicationId)
          }}
          onLoadAuditEvents={() => {
            void loadMobileDeveloperAuditEvents()
          }}
          onLoadBots={() => {
            void loadMobileDeveloperBots()
          }}
          onLoadWebhooks={() => {
            void loadMobileDeveloperWebhooks()
          }}
          onOpenSettings={openNativePermissionSettings}
          onRequest={requestPermission}
          onRotateBotToken={(applicationId) => {
            void rotateMobileDeveloperBotToken(applicationId)
          }}
          onRotateWebhookToken={(webhookId) => {
            void rotateMobileDeveloperWebhookToken(webhookId)
          }}
          onSelectPanel={openMobileSettingsPanel}
          onTestNotificationRoute={runLocalNotificationRouteHarness}
          onWebhookNameChange={setDeveloperWebhookName}
          rows={permissionRows}
          serverUrl={state.serverUrl}
          webhooks={developerWebhooks}
        />
      ) : null}
      {searchOpen ? (
        <MobileSearchPanel
          onChangeQuery={setSearchQuery}
          onChangeScope={setSearchScope}
          onClose={() => setSearchOpen(false)}
          onJumpToMessage={jumpToMobileMessage}
          onOpenChannel={(channel) => {
            setSearchOpen(false)
            openMobileChannel(channel)
          }}
          query={searchQuery}
          scope={searchScope}
          viewModel={searchViewModel}
        />
      ) : null}
      {memberDrawerOpen ? (
        <MobileMemberDrawer
          channelName={activeChannel.name}
          members={memberRows}
          onClose={() => setMemberDrawerOpen(false)}
        />
      ) : null}
      <FlatList
        data={timelineGroups}
        keyExtractor={(group) => group.id}
        renderItem={({ item }) => (
          <MessageGroup
            group={item}
            highlightedMessageId={highlightedMessageId}
            onLongPress={(message) =>
              openMobileMessageActions({ channelId: message.channelId, messageId: message.id })
            }
            onRetry={(messageId) => dispatch({ type: 'message.retry', messageId })}
          />
        )}
        style={styles.flexList}
        contentContainerStyle={styles.timeline}
      />
      {messageActionSheetMessage ? (
        <MessageActionSheet
          message={messageActionSheetMessage}
          onAction={handleMessageAction}
          onClose={() => openMobileMessageActions(null)}
          options={messageActionSheetOptions}
        />
      ) : null}
      <MobileVoiceTray
        channelName={activeVoiceRoomName}
        canListen={mobileCanListenToVoice(state)}
        canSpeak={mobileCanSpeakInVoice(state)}
        participants={voiceParticipants}
        remoteScreenShares={state.voice.media?.remoteScreenShares ?? 0}
        remoteScreenShareStreams={state.voice.media?.remoteScreenShareStreams ?? []}
        selfDeaf={state.voice.selfDeaf}
        selfMute={state.voice.selfMute}
        status={state.voice.connectionStatus}
        errorMessage={state.voice.errorMessage}
        onLeave={leaveVoice}
        onToggleDeaf={toggleDeaf}
        onToggleMute={toggleMute}
      />
      {replyPreviewMessage || editTargetMessage || chatFeedback || composerDisabledReason ? (
        <View style={styles.composerContext}>
          {replyPreviewMessage ? (
            <ComposerContextRow
              label={`Replying to ${replyPreviewMessage.authorName}`}
              onClear={clearMobileDraftTarget}
              value={replyPreviewMessage.content || 'Attachment or embed'}
            />
          ) : null}
          {editTargetMessage ? (
            <ComposerContextRow
              label="Editing message"
              onClear={clearMobileDraftTarget}
              value={editTargetMessage.content}
            />
          ) : null}
          {chatFeedback ? <Text style={styles.composerFeedback}>{chatFeedback}</Text> : null}
          {composerDisabledReason ? (
            <Text style={styles.composerDisabledReason}>{composerDisabledReason}</Text>
          ) : null}
        </View>
      ) : null}
      {pendingAttachments.length > 0 ? (
        <PendingAttachmentTray
          attachments={pendingAttachments}
          onRemove={removePendingAttachment}
          onRetry={(attachmentId) => {
            void retryPendingAttachmentUpload(attachmentId)
          }}
        />
      ) : null}
      <View style={styles.composer}>
        <Pressable
          accessibilityLabel="Add attachment"
          accessibilityRole="button"
          disabled={Boolean(editTarget)}
          onPress={() => {
            void pickMobileAttachments()
          }}
          style={[styles.composerIconButton, editTarget ? styles.disabledIconButton : null]}
        >
          <Text style={styles.composerIconText}>+</Text>
        </Pressable>
        <TextInput
          accessibilityLabel="Message composer"
          onChangeText={(value) => setMobileComposerText(state.selectedChannelId, value)}
          placeholder={composerUi.placeholder}
          placeholderTextColor="#7f877d"
          style={styles.composerInput}
          value={composerText}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!composerUi.canSend}
          onPress={() => {
            void sendMessage()
          }}
          style={[styles.sendButton, !composerUi.canSend ? styles.disabledSendButton : null]}
        >
          <Text style={styles.primaryButtonText}>
            {composerUi.mode === 'edit' ? 'Save' : '↑'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function ServerRail({
  activeConnectionId,
  connections,
  onOpenManager,
  onSwitchServer,
}: {
  activeConnectionId: string
  connections: ServerConnection[]
  onOpenManager: () => void
  onSwitchServer: (connectionId: string) => void
}) {
  return (
    <View style={styles.serverRail}>
      <ScrollView
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.serverRailList}
      >
        {connections.map((connection) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: connection.id === activeConnectionId }}
            key={connection.id}
            onPress={() => onSwitchServer(connection.id)}
            style={[
              styles.serverPill,
              connection.id === activeConnectionId ? styles.activeServerPill : null,
            ]}
          >
            <Text style={styles.serverInitials}>{initialsForLabel(connection.displayName)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        accessibilityLabel="Manage servers"
        accessibilityRole="button"
        onPress={onOpenManager}
        style={styles.addServerPill}
      >
        <Text style={styles.addServerText}>+</Text>
      </Pressable>
    </View>
  )
}

function ServerManagementSheet({
  activeConnectionId,
  onAddServer,
  onClose,
  onRemoveServer,
  onServerUrlChange,
  serverUrl,
}: {
  activeConnectionId: string
  onAddServer: () => void
  onClose: () => void
  onRemoveServer: (connectionId: string) => void
  onServerUrlChange: (value: string) => void
  serverUrl: string
}) {
  return (
    <View style={styles.serverManagerSheet}>
      <View style={styles.sheetHeader}>
        <View>
          <Text style={styles.sheetTitle}>Server connection</Text>
          <Text style={styles.subtle}>Add or remove a self-hosted OpenCord server.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeSheetButton}>
          <Text style={styles.headerActionText}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.serverRailControls}>
        <TextInput
          accessibilityLabel="Server URL"
          autoCapitalize="none"
          onChangeText={onServerUrlChange}
          placeholder="https://chat.example.com"
          placeholderTextColor="#7f877d"
          style={styles.serverRailInput}
          value={serverUrl}
        />
        <Pressable accessibilityRole="button" onPress={onAddServer} style={styles.serverRailButton}>
          <Text style={styles.primaryButtonText}>Add</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => onRemoveServer(activeConnectionId)}
        style={styles.removeCurrentServerButton}
      >
        <Text style={styles.primaryButtonText}>Remove current server</Text>
      </Pressable>
    </View>
  )
}

function MobileMeetingPanel({
  activeVoiceMeetingId,
  channels,
  feedback,
  form,
  localRemindersByMeetingId,
  meetings,
  onCancelMeeting,
  onCloseForm,
  onCopyCalendarUrl,
  onCopyJoinUrl,
  onEditMeeting,
  onFieldChange,
  onJoinMeeting,
  onLeaveMeeting,
  onOpenCalendarUrl,
  onOpenJoinUrl,
  onSaveForm,
  onSelectMeeting,
  onStartCreate,
  selectedMeeting,
}: {
  activeVoiceMeetingId: string | null
  channels: MobileChannel[]
  feedback: string | null
  form: MobileMeetingForm | null
  localRemindersByMeetingId: Record<string, { channel: 'in_app' | 'email'; offsetMinutes: number }>
  meetings: Meeting[]
  onCancelMeeting: (meeting: Meeting) => void
  onCloseForm: () => void
  onCopyCalendarUrl: (meeting: Meeting) => void
  onCopyJoinUrl: (meeting: Meeting) => void
  onEditMeeting: (meeting: Meeting) => void
  onFieldChange: <Key extends keyof MobileMeetingForm>(
    key: Key,
    value: MobileMeetingForm[Key],
  ) => void
  onJoinMeeting: (meeting: Meeting) => void
  onLeaveMeeting: () => void
  onOpenCalendarUrl: (meeting: Meeting) => void
  onOpenJoinUrl: (meeting: Meeting) => void
  onSaveForm: () => void
  onSelectMeeting: (meeting: Meeting) => void
  onStartCreate: () => void
  selectedMeeting: Meeting | null
}) {
  const scheduledMeetings = meetings.filter((meeting) => meeting.status === 'scheduled')

  return (
    <View style={styles.meetingPanel}>
      <View style={styles.meetingPanelHeader}>
        <View>
          <Text style={styles.sheetTitle}>Calendar</Text>
          <Text style={styles.subtle}>{scheduledMeetings.length} scheduled meetings</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onStartCreate}
          style={styles.meetingPrimaryButton}
        >
          <Text style={styles.primaryButtonText}>New</Text>
        </Pressable>
      </View>
      {feedback ? <Text style={styles.composerFeedback}>{feedback}</Text> : null}
      {form ? (
        <MobileMeetingFormView
          form={form}
          onClose={onCloseForm}
          onFieldChange={onFieldChange}
          onSave={onSaveForm}
        />
      ) : null}
      <ScrollView nestedScrollEnabled style={styles.meetingPanelScroll}>
        {scheduledMeetings.length === 0 ? (
          <View style={styles.meetingEmptyState}>
            <Text style={styles.meetingEmptyTitle}>No upcoming meetings</Text>
            <Text style={styles.subtle}>Create one for this server or open a meeting invite.</Text>
          </View>
        ) : (
          scheduledMeetings.map((meeting) => (
            <Pressable
              accessibilityLabel={`Open meeting ${meeting.title}`}
              accessibilityRole="button"
              key={meeting.id}
              onPress={() => onSelectMeeting(meeting)}
              style={[
                styles.meetingListCard,
                selectedMeeting?.id === meeting.id ? styles.selectedMeetingListCard : null,
              ]}
            >
              <Text style={styles.meetingCardTime}>
                {formatOpenCordMeetingDay(meeting.startsAt)}
              </Text>
              <View style={styles.meetingCardBody}>
                <Text numberOfLines={1} style={styles.meetingCardTitle}>
                  {meeting.title}
                </Text>
                <Text style={styles.subtle}>
                  {formatOpenCordMeetingClock(meeting.startsAt, meeting.endsAt)}
                </Text>
                <Text style={styles.meetingChannelLabel}>
                  {openCordMeetingChannelLabel(meeting, channels)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
        {selectedMeeting ? (
          <MobileMeetingDetail
            active={activeVoiceMeetingId === selectedMeeting.id}
            channels={channels}
            localReminder={localRemindersByMeetingId[selectedMeeting.id]}
            meeting={selectedMeeting}
            onCancelMeeting={onCancelMeeting}
            onCopyCalendarUrl={onCopyCalendarUrl}
            onCopyJoinUrl={onCopyJoinUrl}
            onEditMeeting={onEditMeeting}
            onJoinMeeting={onJoinMeeting}
            onLeaveMeeting={onLeaveMeeting}
            onOpenCalendarUrl={onOpenCalendarUrl}
            onOpenJoinUrl={onOpenJoinUrl}
          />
        ) : null}
      </ScrollView>
    </View>
  )
}

function MobileMeetingFormView({
  form,
  onClose,
  onFieldChange,
  onSave,
}: {
  form: MobileMeetingForm
  onClose: () => void
  onFieldChange: <Key extends keyof MobileMeetingForm>(
    key: Key,
    value: MobileMeetingForm[Key],
  ) => void
  onSave: () => void
}) {
  return (
    <View style={styles.meetingForm}>
      <View style={styles.meetingFormHeader}>
        <Text style={styles.meetingSectionTitle}>
          {form.mode === 'edit' ? 'Edit meeting' : 'Create meeting'}
        </Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.clearContextButton}>
          <Text style={styles.headerActionText}>Close</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="Meeting title"
        onChangeText={(value) => onFieldChange('title', value)}
        placeholder="Meeting title"
        placeholderTextColor="#7f877d"
        style={styles.meetingInput}
        value={form.title}
      />
      <View style={styles.meetingFormGrid}>
        <TextInput
          accessibilityLabel="Meeting start time"
          onChangeText={(value) => onFieldChange('startsAt', value)}
          placeholder="YYYY-MM-DDTHH:mm"
          placeholderTextColor="#7f877d"
          style={styles.meetingInput}
          value={form.startsAt}
        />
        <TextInput
          accessibilityLabel="Meeting end time"
          onChangeText={(value) => onFieldChange('endsAt', value)}
          placeholder="YYYY-MM-DDTHH:mm"
          placeholderTextColor="#7f877d"
          style={styles.meetingInput}
          value={form.endsAt}
        />
      </View>
      <View style={styles.meetingReminderRow}>
        <View style={styles.meetingReminderCopy}>
          <Text style={styles.meetingSectionTitle}>Reminder</Text>
          <Text style={styles.subtle}>Local in-app reminder UI only until provider delivery is configured.</Text>
        </View>
        <TextInput
          accessibilityLabel="Reminder minutes before meeting"
          inputMode="numeric"
          onChangeText={(value) =>
            onFieldChange('reminderOffsetMinutes', Math.max(0, Number(value) || 0))
          }
          style={styles.meetingReminderInput}
          value={String(form.reminderOffsetMinutes)}
        />
      </View>
      <View style={styles.meetingFormActions}>
        <Pressable accessibilityRole="button" onPress={onSave} style={styles.meetingPrimaryButton}>
          <Text style={styles.primaryButtonText}>Save</Text>
        </Pressable>
      </View>
    </View>
  )
}

function MobileMeetingDetail({
  active,
  channels,
  localReminder,
  meeting,
  onCancelMeeting,
  onCopyCalendarUrl,
  onCopyJoinUrl,
  onEditMeeting,
  onJoinMeeting,
  onLeaveMeeting,
  onOpenCalendarUrl,
  onOpenJoinUrl,
}: {
  active: boolean
  channels: MobileChannel[]
  localReminder?: { channel: 'in_app' | 'email'; offsetMinutes: number }
  meeting: Meeting
  onCancelMeeting: (meeting: Meeting) => void
  onCopyCalendarUrl: (meeting: Meeting) => void
  onCopyJoinUrl: (meeting: Meeting) => void
  onEditMeeting: (meeting: Meeting) => void
  onJoinMeeting: (meeting: Meeting) => void
  onLeaveMeeting: () => void
  onOpenCalendarUrl: (meeting: Meeting) => void
  onOpenJoinUrl: (meeting: Meeting) => void
}) {
  return (
    <View style={styles.meetingDetailCard}>
      <View style={styles.meetingDetailHeader}>
        <View style={styles.meetingDetailTitleBlock}>
          <Text style={styles.meetingDetailTitle}>{meeting.title}</Text>
          <Text style={styles.subtle}>
            {formatOpenCordMeetingDay(meeting.startsAt)} ·{' '}
            {formatOpenCordMeetingClock(meeting.startsAt, meeting.endsAt)}
          </Text>
        </View>
        <Text style={[styles.meetingStatusPill, active ? styles.activeMeetingStatusPill : null]}>
          {active ? 'Joined' : meeting.status}
        </Text>
      </View>
      <Text style={styles.meetingChannelLabel}>
        {openCordMeetingChannelLabel(meeting, channels)}
      </Text>
      <View style={styles.meetingLinkBlock}>
        <Text style={styles.meetingSectionTitle}>Join URL</Text>
        <Text numberOfLines={2} style={styles.meetingCodeText}>{meeting.joinUrl}</Text>
        <View style={styles.meetingInlineActions}>
          <Pressable accessibilityRole="button" onPress={() => onOpenJoinUrl(meeting)} style={styles.meetingSecondaryButton}>
            <Text style={styles.headerActionText}>Open</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onCopyJoinUrl(meeting)} style={styles.meetingSecondaryButton}>
            <Text style={styles.headerActionText}>Copy</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.meetingLinkBlock}>
        <Text style={styles.meetingSectionTitle}>Calendar invite</Text>
        <Text style={styles.subtle}>ICS download for external calendar apps; provider push delivery is not claimed here.</Text>
        <View style={styles.meetingInlineActions}>
          <Pressable accessibilityRole="button" onPress={() => onOpenCalendarUrl(meeting)} style={styles.meetingSecondaryButton}>
            <Text style={styles.headerActionText}>Open .ics</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onCopyCalendarUrl(meeting)} style={styles.meetingSecondaryButton}>
            <Text style={styles.headerActionText}>Copy .ics</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.meetingReminderSummary}>
        <Text style={styles.meetingSectionTitle}>Reminder</Text>
        <Text style={styles.subtle}>
          {localReminder
            ? `${localReminder.offsetMinutes} minutes before · ${localReminder.channel}`
            : meeting.reminders[0]
              ? `${meeting.reminders[0].offsetMinutes} minutes before · ${meeting.reminders[0].channel}`
              : 'No reminder configured'}
        </Text>
      </View>
      <View style={styles.meetingDetailActions}>
        {active ? (
          <Pressable accessibilityRole="button" onPress={onLeaveMeeting} style={styles.meetingDangerButton}>
            <Text style={styles.primaryButtonText}>Leave</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => onJoinMeeting(meeting)} style={styles.meetingPrimaryButton}>
            <Text style={styles.primaryButtonText}>Join</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => onEditMeeting(meeting)} style={styles.meetingSecondaryButton}>
          <Text style={styles.headerActionText}>Edit</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => onCancelMeeting(meeting)} style={styles.meetingDangerButton}>
          <Text style={styles.primaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  )
}

function WorkspaceNavigator({
  onChannelPress,
  sections,
}: {
  onChannelPress: (channel: Pick<MobileWorkspaceChannelRow, 'id' | 'kind'>) => void
  sections: Array<{
    id: string
    title: string
    channels: MobileWorkspaceChannelRow[]
  }>
}) {
  return (
    <ScrollView contentContainerStyle={styles.navigatorContent} style={styles.flexList}>
      {sections.map((section) => (
        <View key={section.id} style={styles.navigatorSection}>
          <Text style={styles.sectionTitle}>{mobileSectionTitle(section.title)}</Text>
          {section.channels.map((channel) => (
            <ChannelRow
              channel={channel}
              key={channel.id}
              onPress={() => onChannelPress(channel)}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  )
}

function MobileChatHeader({
  channel,
  memberDrawerOpen,
  onBack,
  onOpenMembers,
  onOpenSearch,
  onOpenSettings,
  searchOpen,
}: {
  channel: MobileChannel
  memberDrawerOpen: boolean
  onBack: () => void
  onOpenMembers: () => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  searchOpen: boolean
}) {
  return (
    <View style={styles.chatHeader}>
      <IconButton accessibilityLabel="Open channel list" icon="‹" onPress={onBack} />
      <View style={styles.channelTitleBlock}>
        <Text numberOfLines={1} style={styles.chatTitle}>
          # {channel.name}
        </Text>
        <Text numberOfLines={1} style={styles.chatSubtitle}>
          {channel.topic}
        </Text>
      </View>
      <View style={styles.channelHeaderActions}>
        <IconButton
          accessibilityLabel="Search messages"
          active={searchOpen}
          icon="⌕"
          onPress={onOpenSearch}
        />
        <IconButton
          accessibilityLabel="Open members"
          active={memberDrawerOpen}
          icon="@"
          onPress={onOpenMembers}
        />
        <IconButton accessibilityLabel="Open channel settings" icon="⚙" onPress={onOpenSettings} />
      </View>
    </View>
  )
}

function IconButton({
  accessibilityLabel,
  active = false,
  icon,
  onPress,
}: {
  accessibilityLabel: string
  active?: boolean
  icon: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={4}
      onPress={onPress}
      style={[styles.iconOnlyButton, active ? styles.activeIconOnlyButton : null]}
    >
      <Text
        allowFontScaling={false}
        maxFontSizeMultiplier={1}
        style={styles.iconOnlyButtonText}
      >
        {icon}
      </Text>
    </Pressable>
  )
}

function MobileAccountBar({
  accountName,
  email,
  onOpenSettings,
  onToggleDeaf,
  onToggleMute,
  selfDeaf,
  selfMute,
  voiceConnected,
}: {
  accountName: string
  email: string
  onOpenSettings: () => void
  onToggleDeaf: () => void
  onToggleMute: () => void
  selfDeaf: boolean
  selfMute: boolean
  voiceConnected: boolean
}) {
  return (
    <View style={styles.accountBar}>
      <View style={styles.accountAvatar}>
        <Text style={styles.accountAvatarText}>{initialsForLabel(accountName)}</Text>
      </View>
      <View style={styles.accountCopy}>
        <Text numberOfLines={1} style={styles.accountName}>
          {accountName}
        </Text>
        <Text numberOfLines={1} style={styles.accountStatus}>
          {voiceConnected ? 'Voice connected' : email}
        </Text>
      </View>
      <View style={styles.accountActions}>
        <IconButton
          accessibilityLabel={selfMute ? 'Unmute microphone' : 'Mute microphone'}
          icon={selfMute ? 'M' : 'm'}
          onPress={onToggleMute}
        />
        <IconButton
          accessibilityLabel={selfDeaf ? 'Undeafen' : 'Deafen'}
          icon={selfDeaf ? 'D' : 'd'}
          onPress={onToggleDeaf}
        />
        <IconButton accessibilityLabel="Open account settings" icon="⚙" onPress={onOpenSettings} />
      </View>
    </View>
  )
}

function ChannelRow({
  channel,
  onPress,
}: {
  channel: MobileWorkspaceChannelRow
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: channel.selected }}
      onPress={onPress}
      style={[styles.channelRow, channel.selected ? styles.selectedChannelRow : null]}
    >
      <View style={[styles.channelGlyph, channel.selected ? styles.selectedChannelGlyph : null]}>
        <Text style={styles.channelGlyphText}>{channel.kind === 'voice' ? 'V' : '#'}</Text>
      </View>
      <View style={styles.channelRowCopy}>
        <Text style={styles.channelName}>
          {channel.name}
        </Text>
        <Text style={styles.subtle}>{channel.topic}</Text>
      </View>
      <View style={styles.channelMeta}>
        {channel.kind === 'voice' && channel.voiceOccupancy > 0 ? (
          <Text style={styles.voiceOccupancy}>{channel.voiceOccupancy}</Text>
        ) : null}
        {channel.connected ? <Text style={styles.voiceConnectedLabel}>Voice</Text> : null}
        {channel.mentionCount > 0 ? (
          <Text style={styles.mentionBadge}>{channel.mentionCount}</Text>
        ) : channel.unread ? (
          <View style={styles.unreadDot} />
        ) : null}
      </View>
    </Pressable>
  )
}

const mobileSearchScopeTabs: Array<{ label: string; scope: MobileSearchScope }> = [
  { label: 'All', scope: 'all' },
  { label: 'Channels', scope: 'channels' },
  { label: 'Messages', scope: 'messages' },
  { label: 'Mentions', scope: 'mentions' },
]

function MobileSearchPanel({
  onChangeQuery,
  onChangeScope,
  onClose,
  onJumpToMessage,
  onOpenChannel,
  query,
  scope,
  viewModel,
}: {
  onChangeQuery: (query: string) => void
  onChangeScope: (scope: MobileSearchScope) => void
  onClose: () => void
  onJumpToMessage: (messageId: string) => void
  onOpenChannel: (channel: Pick<MobileChannel, 'id' | 'kind'>) => void
  query: string
  scope: MobileSearchScope
  viewModel: MobileSearchViewModel
}) {
  const showResults = viewModel.status === 'ready'

  return (
    <View style={styles.searchPanel}>
      <View style={styles.sheetHeader}>
        <View style={styles.actionSheetTitleBlock}>
          <Text style={styles.sheetTitle}>Search</Text>
          <Text style={styles.subtle}>{viewModel.message}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeSheetButton}>
          <Text style={styles.headerActionText}>Close</Text>
        </Pressable>
      </View>
      <TextInput
        accessibilityLabel="Search channels and messages"
        autoCapitalize="none"
        onChangeText={onChangeQuery}
        placeholder={scope === 'mentions' ? 'Filter mentions' : 'Search #channels and messages'}
        placeholderTextColor="#7f877d"
        style={styles.searchInput}
        value={query}
      />
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        style={styles.searchTabs}
      >
        {mobileSearchScopeTabs.map((tab) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: scope === tab.scope }}
            key={tab.scope}
            onPress={() => onChangeScope(tab.scope)}
            style={[styles.searchTab, scope === tab.scope ? styles.activeSearchTab : null]}
          >
            <Text
              style={[
                styles.searchTabText,
                scope === tab.scope ? styles.activeSearchTabText : null,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={styles.searchResultsContent}
        keyboardShouldPersistTaps="handled"
        style={styles.searchResults}
      >
        {!showResults ? (
          <SearchStateRow status={viewModel.status} text={viewModel.message} />
        ) : null}
        {showResults && viewModel.channelResults.length > 0 ? (
          <SearchResultSection title="Channels">
            {viewModel.channelResults.map((result) => (
              <Pressable
                accessibilityRole="button"
                key={result.channelId}
                onPress={() =>
                  onOpenChannel({ id: result.channelId, kind: result.channelKind })
                }
                style={styles.searchResultRow}
              >
                <Text style={styles.searchResultIcon}>
                  {result.channelKind === 'voice' ? 'V' : '#'}
                </Text>
                <View style={styles.searchResultCopy}>
                  <Text numberOfLines={1} style={styles.searchResultTitle}>
                    {result.channelName}
                  </Text>
                  <Text numberOfLines={1} style={styles.subtle}>
                    {result.topic || (result.channelKind === 'voice' ? 'Voice channel' : 'Text channel')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </SearchResultSection>
        ) : null}
        {showResults && viewModel.messageResults.length > 0 ? (
          <SearchResultSection title="Messages">
            {viewModel.messageResults.map((result) => (
              <MessageSearchResultRow
                key={result.messageId}
                onPress={() => onJumpToMessage(result.messageId)}
                prefix={`#${result.channelName}`}
                result={result}
              />
            ))}
          </SearchResultSection>
        ) : null}
        {showResults && viewModel.mentionResults.length > 0 ? (
          <SearchResultSection title="Recent mentions">
            {viewModel.mentionResults.map((result) => (
              <MessageSearchResultRow
                key={`mention-${result.messageId}`}
                onPress={() => onJumpToMessage(result.messageId)}
                prefix={result.mentionLabel}
                result={result}
              />
            ))}
          </SearchResultSection>
        ) : null}
      </ScrollView>
    </View>
  )
}

function SearchStateRow({
  status,
  text,
}: {
  status: MobileSearchViewModel['status']
  text: string
}) {
  return (
    <View style={styles.searchStateRow}>
      <Text style={styles.searchStateIcon}>{searchStateIcon(status)}</Text>
      <Text style={styles.searchStateText}>{text}</Text>
    </View>
  )
}

function SearchResultSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <View style={styles.searchResultSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function MessageSearchResultRow({
  onPress,
  prefix,
  result,
}: {
  onPress: () => void
  prefix: string
  result: { authorName: string; excerpt: string; time: string }
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.searchResultRow}>
      <Text style={styles.searchResultIcon}>↗</Text>
      <View style={styles.searchResultCopy}>
        <View style={styles.searchResultMetaRow}>
          <Text numberOfLines={1} style={styles.searchResultTitle}>
            {prefix}
          </Text>
          <Text style={styles.messageTime}>{result.time}</Text>
        </View>
        <Text numberOfLines={1} style={styles.subtle}>
          {result.authorName}: {result.excerpt}
        </Text>
      </View>
    </Pressable>
  )
}

function searchStateIcon(status: MobileSearchViewModel['status']) {
  switch (status) {
    case 'idle':
      return '⌕'
    case 'loading':
      return '…'
    case 'error':
      return '!'
    case 'permission-denied':
      return '×'
    case 'empty':
      return '0'
    case 'ready':
      return '✓'
  }
}

function MobileMemberDrawer({
  channelName,
  members,
  onClose,
}: {
  channelName: string
  members: MobileMemberRow[]
  onClose: () => void
}) {
  return (
    <View style={styles.memberDrawer}>
      <View style={styles.sheetHeader}>
        <View style={styles.actionSheetTitleBlock}>
          <Text style={styles.sheetTitle}>Members</Text>
          <Text style={styles.subtle}>#{channelName} · {members.length} visible</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeSheetButton}>
          <Text style={styles.headerActionText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.memberListContent} style={styles.memberList}>
        {members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>{initialsForLabel(member.displayName)}</Text>
              <View style={[styles.presenceDot, presenceDotStyle(member.presence)]} />
            </View>
            <View style={styles.memberCopy}>
              <View style={styles.memberNameRow}>
                <Text numberOfLines={1} style={styles.memberName}>
                  {member.displayName}
                </Text>
                {member.bot ? <Text style={styles.authorBadge}>BOT</Text> : null}
                {member.self ? <Text style={styles.selfBadge}>YOU</Text> : null}
              </View>
              <Text numberOfLines={1} style={styles.subtle}>
                {presenceLabel(member.presence)} · {member.activity}
              </Text>
            </View>
            <Text style={styles.memberRole}>{member.role}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

function presenceLabel(presence: MobileMemberRow['presence']) {
  switch (presence) {
    case 'speaking':
      return 'Speaking'
    case 'muted':
      return 'Muted'
    case 'deafened':
      return 'Deafened'
    case 'idle':
      return 'Idle'
    case 'offline':
      return 'Offline'
    case 'online':
      return 'Online'
  }
}

function presenceDotStyle(presence: MobileMemberRow['presence']) {
  switch (presence) {
    case 'speaking':
      return styles.presenceSpeaking
    case 'muted':
      return styles.presenceMuted
    case 'deafened':
      return styles.presenceDeafened
    case 'idle':
      return styles.presenceIdle
    case 'offline':
      return styles.presenceOffline
    case 'online':
      return styles.presenceOnline
  }
}

const mobileSettingsTabs: Array<{ panel: OpenCordSettingsPanel; label: string }> = [
  { panel: 'account', label: 'Account' },
  { panel: 'server-connections', label: 'Servers' },
  { panel: 'voice-video', label: 'Voice' },
  { panel: 'notifications', label: 'Notifications' },
  { panel: 'appearance', label: 'Appearance' },
  { panel: 'developer', label: 'Developer' },
]

function MobileSettingsPanel({
  accountName,
  activePanel,
  auditEvents,
  botApplications,
  developerBotName,
  developerChannelId,
  developerChannelName,
  developerFeedback,
  developerOrganizationId,
  developerSpaceId,
  developerStatus,
  developerWebhookName,
  email,
  feedback,
  hasSavedDeviceSession,
  logoutStatus,
  maxHeight,
  notificationRouteStatus,
  onBotNameChange,
  onClearSavedLogin,
  onClose,
  onCreateBot,
  onCreateWebhook,
  onDeleteWebhook,
  onInviteBot,
  onLoadAuditEvents,
  onLoadBots,
  onLoadWebhooks,
  onLogout,
  onOpenSettings,
  onRequest,
  onRotateBotToken,
  onRotateWebhookToken,
  onSelectPanel,
  onTestNotificationRoute,
  onWebhookNameChange,
  rows,
  serverUrl,
  webhooks,
}: {
  accountName: string
  activePanel: OpenCordSettingsPanel
  auditEvents: AuditEvent[]
  botApplications: BotApplicationDetail[]
  developerBotName: string
  developerChannelId: string | null
  developerChannelName: string
  developerFeedback: string | null
  developerOrganizationId: string | null
  developerSpaceId: string
  developerStatus: 'idle' | 'loading'
  developerWebhookName: string
  email: string
  feedback: string | null
  hasSavedDeviceSession: boolean
  logoutStatus: 'idle' | 'loading'
  maxHeight: number
  notificationRouteStatus: string
  onBotNameChange: (name: string) => void
  onClearSavedLogin: () => void
  onClose: () => void
  onCreateBot: () => void
  onCreateWebhook: () => void
  onDeleteWebhook: (webhookId: string) => void
  onInviteBot: (applicationId: string) => void
  onLoadAuditEvents: () => void
  onLoadBots: () => void
  onLoadWebhooks: () => void
  onLogout: () => void
  onOpenSettings: () => void
  onRequest: (kind: MobileMediaPermissionKind) => void
  onRotateBotToken: (applicationId: string) => void
  onRotateWebhookToken: (webhookId: string) => void
  onSelectPanel: (panel: OpenCordSettingsPanel) => void
  onTestNotificationRoute: () => void
  onWebhookNameChange: (name: string) => void
  rows: MobileMediaPermissionRow[]
  serverUrl: string
  webhooks: IncomingWebhook[]
}) {
  const visiblePanel = activePanel === 'native-call-integration' ? 'voice-video' : activePanel
  const permissionRows =
    visiblePanel === 'notifications'
      ? rows.filter((row) => row.kind === 'notifications')
      : visiblePanel === 'privacy-permissions'
        ? rows
        : rows.filter((row) => row.kind !== 'notifications')

  return (
    <ScrollView
      contentContainerStyle={styles.settingsPanelContent}
      nestedScrollEnabled
      style={[styles.settingsPanel, { height: maxHeight }]}
    >
      <View style={styles.settingsPanelHeader}>
        <View style={styles.settingsPanelTitleBlock}>
          <Text style={styles.permissionTitle}>Settings</Text>
          <Text numberOfLines={1} style={styles.subtle}>
            {serverUrl}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeSheetButton}>
          <Text style={styles.headerActionText}>Close</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.settingsTabs}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {mobileSettingsTabs.map((tab) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: visiblePanel === tab.panel }}
            key={tab.panel}
            onPress={() => onSelectPanel(tab.panel)}
            style={[
              styles.settingsTab,
              visiblePanel === tab.panel ? styles.activeSettingsTab : null,
            ]}
          >
            <Text
              style={[
                styles.settingsTabText,
                visiblePanel === tab.panel ? styles.activeSettingsTabText : null,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {visiblePanel === 'account' ? (
        <View style={styles.settingsSection}>
          <SettingsInfoRow label="Account" value={accountName} detail={email} />
          <SettingsInfoRow label="Current server" value={serverUrl} />
          <SettingsInfoRow
            label="Saved login"
            value={hasSavedDeviceSession ? 'On this device' : 'Session only'}
            detail={
              hasSavedDeviceSession
                ? 'OpenCord can restore this account after restart.'
                : 'OpenCord will ask for login after restart.'
            }
          />
          {feedback ? <Text style={styles.permissionStatus}>{feedback}</Text> : null}
          <View style={styles.settingsActionRow}>
            <Pressable
              accessibilityRole="button"
              disabled={!hasSavedDeviceSession}
              onPress={onClearSavedLogin}
              style={[
                styles.secondarySettingsButton,
                !hasSavedDeviceSession ? styles.disabledSettingsButton : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>Clear saved login</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={logoutStatus === 'loading'}
              onPress={onLogout}
              style={[
                styles.dangerSettingsButton,
                logoutStatus === 'loading' ? styles.disabledSettingsButton : null,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {logoutStatus === 'loading' ? 'Logging out' : 'Log out'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {visiblePanel === 'server-connections' ? (
        <View style={styles.settingsSection}>
          <SettingsInfoRow label="Current server" value={serverUrl} />
          <SettingsInfoRow
            label="Identity"
            value={email}
            detail="Account and saved login stay separate per server."
          />
        </View>
      ) : null}
      {visiblePanel === 'voice-video' || visiblePanel === 'notifications' || visiblePanel === 'privacy-permissions' ? (
        <PermissionSettingsRows
          onOpenSettings={onOpenSettings}
          onRequest={onRequest}
          rows={permissionRows}
        />
      ) : null}
      {visiblePanel === 'notifications' ? (
        <View style={styles.settingsSection}>
          <SettingsInfoRow
            detail="Routes through the same server, channel, message, and meeting target parser used by native notification taps."
            label="Local tap route"
            value={notificationRouteStatus}
          />
          <View style={styles.settingsActionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onTestNotificationRoute}
              style={styles.secondarySettingsButton}
            >
              <Text style={styles.primaryButtonText}>Test route</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {visiblePanel === 'appearance' ? (
        <View style={styles.settingsSection}>
          <SettingsInfoRow label="Theme" value="Dark" />
          <SettingsInfoRow label="Density" value="Compact mobile" />
        </View>
      ) : null}
      {visiblePanel === 'developer' ? (
        <DeveloperSettingsRows
          auditEvents={auditEvents}
          botApplications={botApplications}
          botName={developerBotName}
          channelId={developerChannelId}
          channelName={developerChannelName}
          feedback={developerFeedback}
          loading={developerStatus === 'loading'}
          onBotNameChange={onBotNameChange}
          onCreateBot={onCreateBot}
          onCreateWebhook={onCreateWebhook}
          onDeleteWebhook={onDeleteWebhook}
          onInviteBot={onInviteBot}
          onLoadAuditEvents={onLoadAuditEvents}
          onLoadBots={onLoadBots}
          onLoadWebhooks={onLoadWebhooks}
          onRotateBotToken={onRotateBotToken}
          onRotateWebhookToken={onRotateWebhookToken}
          onWebhookNameChange={onWebhookNameChange}
          organizationId={developerOrganizationId}
          spaceId={developerSpaceId}
          webhookName={developerWebhookName}
          webhooks={webhooks}
        />
      ) : null}
    </ScrollView>
  )
}

function SettingsInfoRow({
  detail,
  label,
  value,
}: {
  detail?: string
  label: string
  value: string
}) {
  return (
    <View style={styles.settingsInfoRow}>
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionLabel}>{label}</Text>
        {detail ? <Text style={styles.subtle}>{detail}</Text> : null}
      </View>
      <Text numberOfLines={1} style={styles.settingsInfoValue}>
        {value}
      </Text>
    </View>
  )
}

function DeveloperSettingsRows({
  auditEvents,
  botApplications,
  botName,
  channelId,
  channelName,
  feedback,
  loading,
  onBotNameChange,
  onCreateBot,
  onCreateWebhook,
  onDeleteWebhook,
  onInviteBot,
  onLoadAuditEvents,
  onLoadBots,
  onLoadWebhooks,
  onRotateBotToken,
  onRotateWebhookToken,
  onWebhookNameChange,
  organizationId,
  spaceId,
  webhookName,
  webhooks,
}: {
  auditEvents: AuditEvent[]
  botApplications: BotApplicationDetail[]
  botName: string
  channelId: string | null
  channelName: string
  feedback: string | null
  loading: boolean
  onBotNameChange: (name: string) => void
  onCreateBot: () => void
  onCreateWebhook: () => void
  onDeleteWebhook: (webhookId: string) => void
  onInviteBot: (applicationId: string) => void
  onLoadAuditEvents: () => void
  onLoadBots: () => void
  onLoadWebhooks: () => void
  onRotateBotToken: (applicationId: string) => void
  onRotateWebhookToken: (webhookId: string) => void
  onWebhookNameChange: (name: string) => void
  organizationId: string | null
  spaceId: string
  webhookName: string
  webhooks: IncomingWebhook[]
}) {
  const visibleAuditEvents = [...auditEvents]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5)

  return (
    <View style={styles.settingsSection}>
      <SettingsInfoRow
        detail="Uses your current signed-in server session."
        label="Organization"
        value={shortIdentifier(organizationId)}
      />
      <SettingsInfoRow label="Space" value={shortIdentifier(spaceId)} />
      <SettingsInfoRow
        detail={channelId ? shortIdentifier(channelId) : 'Select a text channel first.'}
        label="Webhook channel"
        value={channelName}
      />
      {feedback ? <Text style={styles.permissionStatus}>{feedback}</Text> : null}
      <View style={styles.settingsActionRow}>
        <DeveloperActionButton disabled={loading} label="Load bots" onPress={onLoadBots} />
        <DeveloperActionButton disabled={loading} label="Load hooks" onPress={onLoadWebhooks} />
        <DeveloperActionButton disabled={loading} label="Load audit" onPress={onLoadAuditEvents} />
      </View>

      <Text style={styles.permissionTitle}>Bot Applications</Text>
      <View style={styles.developerCreateRow}>
        <TextInput
          autoCapitalize="words"
          onChangeText={onBotNameChange}
          placeholder="Bot name"
          placeholderTextColor="#777f79"
          style={[styles.input, styles.developerInput]}
          value={botName}
        />
        <DeveloperActionButton disabled={loading} label="Create" onPress={onCreateBot} />
      </View>
      {botApplications.length === 0 ? (
        <Text style={styles.subtle}>No bot applications loaded.</Text>
      ) : (
        botApplications.map((bot) => (
          <DeveloperBotRow
            bot={bot}
            disabled={loading}
            key={bot.botApplication.id}
            onInvite={onInviteBot}
            onRotateToken={onRotateBotToken}
          />
        ))
      )}

      <Text style={styles.permissionTitle}>Incoming Webhooks</Text>
      <View style={styles.developerCreateRow}>
        <TextInput
          autoCapitalize="words"
          onChangeText={onWebhookNameChange}
          placeholder="Webhook name"
          placeholderTextColor="#777f79"
          style={[styles.input, styles.developerInput]}
          value={webhookName}
        />
        <DeveloperActionButton disabled={loading} label="Create" onPress={onCreateWebhook} />
      </View>
      {webhooks.length === 0 ? (
        <Text style={styles.subtle}>No incoming webhooks loaded for this channel.</Text>
      ) : (
        webhooks.map((webhook) => (
          <DeveloperWebhookRow
            disabled={loading}
            key={webhook.id}
            onDelete={onDeleteWebhook}
            onRotateToken={onRotateWebhookToken}
            webhook={webhook}
          />
        ))
      )}

      <Text style={styles.permissionTitle}>Audit Events</Text>
      {visibleAuditEvents.length === 0 ? (
        <Text style={styles.subtle}>No audit events loaded for this space.</Text>
      ) : (
        visibleAuditEvents.map((event) => (
          <View key={event.id} style={styles.developerCard}>
            <View style={styles.permissionCopy}>
              <Text style={styles.permissionLabel}>{event.action}</Text>
              <Text style={styles.subtle}>
                {event.targetType} {shortIdentifier(event.targetId)}
              </Text>
              <Text style={styles.permissionStatus}>{formatCompactDateTime(event.createdAt)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

function DeveloperBotRow({
  bot,
  disabled,
  onInvite,
  onRotateToken,
}: {
  bot: BotApplicationDetail
  disabled: boolean
  onInvite: (applicationId: string) => void
  onRotateToken: (applicationId: string) => void
}) {
  return (
    <View style={styles.developerCard}>
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionLabel}>{bot.botApplication.name}</Text>
        <Text style={styles.subtle}>
          Token {lastFourSecretLabel(bot.activeTokenLastFour)} · {bot.spaceMemberships.length}{' '}
          space{bot.spaceMemberships.length === 1 ? '' : 's'}
        </Text>
        {bot.botApplication.description ? (
          <Text style={styles.subtle}>{bot.botApplication.description}</Text>
        ) : null}
      </View>
      <View style={styles.settingsActionRow}>
        <DeveloperActionButton
          disabled={disabled}
          label="Rotate"
          onPress={() => onRotateToken(bot.botApplication.id)}
        />
        <DeveloperActionButton
          disabled={disabled}
          label="Invite"
          onPress={() => onInvite(bot.botApplication.id)}
        />
      </View>
    </View>
  )
}

function DeveloperWebhookRow({
  disabled,
  onDelete,
  onRotateToken,
  webhook,
}: {
  disabled: boolean
  onDelete: (webhookId: string) => void
  onRotateToken: (webhookId: string) => void
  webhook: IncomingWebhook
}) {
  return (
    <View style={styles.developerCard}>
      <View style={styles.permissionCopy}>
        <Text style={styles.permissionLabel}>{webhook.name}</Text>
        <Text style={styles.subtle}>
          Token {lastFourSecretLabel(webhook.tokenLastFour)} · {shortIdentifier(webhook.id)}
        </Text>
        <Text style={styles.permissionStatus}>{webhook.status}</Text>
      </View>
      <View style={styles.settingsActionRow}>
        <DeveloperActionButton
          disabled={disabled}
          label="Rotate"
          onPress={() => onRotateToken(webhook.id)}
        />
        <DeveloperActionButton
          danger
          disabled={disabled}
          label="Delete"
          onPress={() => onDelete(webhook.id)}
        />
      </View>
    </View>
  )
}

function DeveloperActionButton({
  danger,
  disabled,
  label,
  onPress,
}: {
  danger?: boolean
  disabled: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        danger ? styles.dangerSettingsButton : styles.secondarySettingsButton,
        styles.developerActionButton,
        disabled ? styles.disabledSettingsButton : null,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  )
}

function PermissionSettingsRows({
  onOpenSettings,
  onRequest,
  rows,
}: {
  onOpenSettings: () => void
  onRequest: (kind: MobileMediaPermissionKind) => void
  rows: MobileMediaPermissionRow[]
}) {
  return (
    <>
      {rows.map((row) => (
        <View key={row.kind} style={styles.permissionRow}>
          <View style={styles.permissionCopy}>
            <Text style={styles.permissionLabel}>{row.label}</Text>
            <Text style={styles.subtle}>{row.purpose}</Text>
            <Text style={styles.permissionStatus}>{permissionStatusLabel(row.status)}</Text>
          </View>
          {row.status === 'system-settings-required' ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenSettings}
              style={styles.permissionButton}
            >
              <Text style={styles.primaryButtonText}>Settings</Text>
            </Pressable>
          ) : row.canRequest ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => onRequest(row.kind)}
              style={styles.permissionButton}
            >
              <Text style={styles.primaryButtonText}>
                {row.status === 'denied' ? 'Retry' : 'Grant'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </>
  )
}

function MobileVoiceTray({
  canListen,
  canSpeak,
  channelName,
  errorMessage,
  participants,
  remoteScreenShares,
  remoteScreenShareStreams,
  selfDeaf,
  selfMute,
  status,
  onLeave,
  onToggleDeaf,
  onToggleMute,
}: {
  canListen: boolean
  canSpeak: boolean
  channelName?: string
  errorMessage: string | null
  participants: MobileVoiceParticipant[]
  remoteScreenShares: number
  remoteScreenShareStreams: NativeScreenShareStream[]
  selfDeaf: boolean
  selfMute: boolean
  status: 'idle' | 'connecting' | 'connected' | 'blocked' | 'failed'
  onLeave: () => void
  onToggleDeaf: () => void
  onToggleMute: () => void
}) {
  if (!channelName) {
    return null
  }

  return (
    <View style={styles.voiceTray}>
      <View style={styles.voiceTrayTopRow}>
        <View style={styles.voiceSummary}>
          <Text style={styles.voiceTitle}>{voiceStatusLabel(status)}</Text>
          <Text numberOfLines={1} style={styles.subtle}>
            {channelName}
          </Text>
        </View>
        <View style={styles.voiceActions}>
          <Pressable
            accessibilityLabel={selfMute ? 'Unmute microphone' : 'Mute microphone'}
            accessibilityRole="button"
            onPress={onToggleMute}
            style={styles.voiceIconButton}
          >
            <Text style={styles.headerActionText}>{selfMute ? 'M' : 'm'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={selfDeaf ? 'Undeafen' : 'Deafen'}
            accessibilityRole="button"
            onPress={onToggleDeaf}
            style={styles.voiceIconButton}
          >
            <Text style={styles.headerActionText}>{selfDeaf ? 'D' : 'd'}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Leave voice"
            accessibilityRole="button"
            onPress={onLeave}
            style={[styles.voiceIconButton, styles.leaveVoiceButton]}
          >
            <Text style={styles.headerActionText}>×</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.voiceCompactStatus}>
        {canListen ? 'Listening' : 'Deafened'} / {canSpeak ? 'Speaking' : 'Muted'}
        {remoteScreenShares > 0 ? ` / ${remoteScreenShares} screen share` : ''}
      </Text>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      <RemoteScreenShareStrip streams={remoteScreenShareStreams} />
      <View style={styles.voiceParticipants}>
        {participants.map((participant) => (
          <Text key={participant.id} style={styles.voiceParticipant}>
            {participant.name} -{' '}
            {participant.self ? voiceSelfStatus(selfMute, selfDeaf) : participant.status}
          </Text>
        ))}
      </View>
    </View>
  )
}

function RemoteScreenShareStrip({ streams }: { streams: NativeScreenShareStream[] }) {
  if (streams.length === 0) {
    return null
  }

  return (
    <ScrollView
      accessibilityLabel="Remote screen shares"
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.screenShareStrip}
    >
      {streams.map((stream) => (
        <View key={stream.id} style={styles.screenShareTile}>
          <RTCView
            mirror={false}
            objectFit="contain"
            streamURL={stream.streamUrl}
            style={styles.screenShareVideo}
          />
          <Text numberOfLines={1} style={styles.screenShareLabel}>
            {stream.participantIdentity}
          </Text>
        </View>
      ))}
    </ScrollView>
  )
}

function permissionStatusLabel(status: MobileMediaPermissionRow['status']) {
  switch (status) {
    case 'granted':
      return 'Granted'
    case 'denied':
      return 'Denied'
    case 'promptable':
      return 'Not granted'
    case 'system-settings-required':
      return 'Open system settings'
    case 'unsupported':
      return 'Not supported'
  }
}

function voiceStatusLabel(status: 'idle' | 'connecting' | 'connected' | 'blocked' | 'failed') {
  switch (status) {
    case 'connecting':
      return 'Voice connecting'
    case 'blocked':
      return 'Voice blocked'
    case 'failed':
      return 'Voice unavailable'
    case 'idle':
    case 'connected':
      return 'Voice connected'
  }
}

function voiceSelfStatus(selfMute: boolean, selfDeaf: boolean) {
  if (selfDeaf) {
    return 'deafened'
  }

  if (selfMute) {
    return 'muted'
  }

  return 'connected'
}

function MessageGroup({
  group,
  highlightedMessageId,
  onLongPress,
  onRetry,
}: {
  group: MobileMessageTimelineGroup
  highlightedMessageId: string | null
  onLongPress: (message: MobileMessage) => void
  onRetry: (messageId: string) => void
}) {
  return (
    <View style={[styles.messageGroup, group.own ? styles.ownMessageGroup : null]}>
      <View style={styles.messageAvatar}>
        {group.avatarUrl ? (
          <Image source={{ uri: group.avatarUrl }} style={styles.messageAvatarImage} />
        ) : (
          <Text style={styles.messageAvatarText}>{initialsForLabel(group.authorName)}</Text>
        )}
      </View>
      <View style={styles.messageGroupBody}>
        <View style={styles.messageGroupHeader}>
          <Text style={styles.messageAuthor}>{group.authorName}</Text>
          {group.authorBadge ? <Text style={styles.authorBadge}>{group.authorBadge}</Text> : null}
          <Text style={styles.messageTime}>{group.messages[0]?.time}</Text>
        </View>
        {group.messages.map((message) => (
          <MessageBubble
            highlighted={message.id === highlightedMessageId}
            key={message.id}
            message={message}
            onLongPress={() => onLongPress(message)}
            onRetry={() => onRetry(message.id)}
          />
        ))}
      </View>
    </View>
  )
}

function MessageBubble({
  highlighted,
  message,
  onLongPress,
  onRetry,
}: {
  highlighted: boolean
  message: MobileMessage
  onLongPress: () => void
  onRetry: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Message from ${message.authorName}`}
      accessibilityRole="button"
      onLongPress={onLongPress}
      style={[
        styles.message,
        message.own ? styles.ownMessage : null,
        highlighted ? styles.highlightedMessage : null,
      ]}
    >
      {message.replyToMessageId ? (
        <Text style={styles.replyPreview}>Replying to {message.replyToMessageId}</Text>
      ) : null}
      {message.pinned ? <Text style={styles.messageMeta}>Pinned</Text> : null}
      {message.deleted ? (
        <Text style={styles.deletedMessage}>Message deleted</Text>
      ) : message.content ? (
        <MessageContentText content={message.content} />
      ) : null}
      <MobileMessageAttachmentList attachments={message.attachments} />
      <MobileRichEmbedList embeds={message.embeds} />
      <MobileMessageComponentList components={message.components} />
      {message.edited ? <Text style={styles.messageMeta}>edited</Text> : null}
      {message.deliveryStatus && message.deliveryStatus !== 'sent' ? (
        <View style={styles.deliveryRow}>
          <Text style={message.deliveryStatus === 'failed' ? styles.errorText : styles.subtle}>
            {message.deliveryStatus === 'failed'
              ? message.deliveryError ?? 'Unable to send.'
              : 'Sending...'}
          </Text>
          {message.deliveryStatus === 'failed' ? (
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.headerActionText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {message.reactions && message.reactions.length > 0 ? (
        <View style={styles.reactionRow}>
          {message.reactions.map((reaction) => (
            <Text key={reaction.emoji} style={styles.reactionPill}>
              {reaction.emoji} {reaction.count}
            </Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}

function MessageContentText({ content }: { content: string }) {
  const mentions = mobileMentionTokens(content)
  if (mentions.length === 0) {
    return <Text style={styles.messageContent}>{content}</Text>
  }

  const segments: Array<{ kind: 'text' | 'mention'; value: string }> = []
  let cursor = 0
  for (const mention of mentions) {
    if (mention.start > cursor) {
      segments.push({ kind: 'text', value: content.slice(cursor, mention.start) })
    }
    segments.push({ kind: 'mention', value: content.slice(mention.start, mention.end) })
    cursor = mention.end
  }
  if (cursor < content.length) {
    segments.push({ kind: 'text', value: content.slice(cursor) })
  }

  return (
    <Text style={styles.messageContent}>
      {segments.map((segment, index) => (
        <Text
          key={`${segment.kind}-${index}-${segment.value}`}
          style={segment.kind === 'mention' ? styles.mentionText : null}
        >
          {segment.value}
        </Text>
      ))}
    </Text>
  )
}

function MessageActionSheet({
  message,
  onAction,
  onClose,
  options,
}: {
  message: MobileMessage
  onAction: (actionId: MobileMessageActionId, message: MobileMessage) => void
  onClose: () => void
  options: MobileMessageActionOption[]
}) {
  return (
    <View style={styles.messageActionSheet}>
      <View style={styles.sheetHeader}>
        <View style={styles.actionSheetTitleBlock}>
          <Text style={styles.sheetTitle}>Message actions</Text>
          <Text numberOfLines={1} style={styles.subtle}>
            {message.content || 'Attachment or embed'}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeSheetButton}>
          <Text style={styles.headerActionText}>Close</Text>
        </Pressable>
      </View>
      <View style={styles.messageActionGrid}>
        {options.map((option) => (
          <Pressable
            accessibilityRole="button"
            key={option.id}
            onPress={() => onAction(option.id, message)}
            style={[
              styles.messageActionRow,
              option.destructive ? styles.destructiveMessageActionButton : null,
            ]}
          >
            <Text style={styles.messageActionIcon}>{messageActionIcon(option.id)}</Text>
            <Text style={styles.messageActionLabel}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

function mobileSectionTitle(title: string) {
  return title.split(' / ').at(-1) ?? title
}

function messageActionIcon(actionId: MobileMessageActionId) {
  switch (actionId) {
    case 'reply':
      return '↩'
    case 'edit':
      return '✎'
    case 'delete':
      return '×'
    case 'copy':
      return '□'
    case 'pin':
      return '⌖'
    case 'react':
      return '+'
    case 'report':
      return '!'
  }
}

function ComposerContextRow({
  label,
  onClear,
  value,
}: {
  label: string
  onClear: () => void
  value: string
}) {
  return (
    <View style={styles.composerContextRow}>
      <View style={styles.composerContextCopy}>
        <Text style={styles.composerContextLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.subtle}>
          {value}
        </Text>
      </View>
      <Pressable accessibilityRole="button" onPress={onClear} style={styles.clearContextButton}>
        <Text style={styles.headerActionText}>Cancel</Text>
      </Pressable>
    </View>
  )
}

function PendingAttachmentTray({
  attachments,
  onRemove,
  onRetry,
}: {
  attachments: MobilePendingAttachment[]
  onRemove: (attachmentId: string) => void
  onRetry: (attachmentId: string) => void
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pendingAttachmentScroller}
      contentContainerStyle={styles.pendingAttachmentList}
    >
      {attachments.map((attachment) => (
        <View key={attachment.id} style={styles.pendingAttachmentCard}>
          <Text numberOfLines={1} style={styles.pendingAttachmentName}>
            {attachment.fileName}
          </Text>
          <Text style={styles.attachmentMetaText}>
            {attachment.contentType} · {formatAttachmentSize(attachment.sizeBytes)}
          </Text>
          <Text
            style={[
              styles.attachmentMetaText,
              attachment.uploadStatus === 'failed' ? styles.attachmentErrorText : null,
            ]}
          >
            {pendingAttachmentStatusLabel(attachment)}
          </Text>
          <View style={styles.pendingAttachmentActions}>
            {attachment.uploadStatus === 'failed' ? (
              <Pressable
                accessibilityLabel={`Retry ${attachment.fileName}`}
                accessibilityRole="button"
                onPress={() => onRetry(attachment.id)}
                style={styles.retryAttachmentButton}
              >
                <Text style={styles.headerActionText}>Retry</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={`Remove ${attachment.fileName}`}
              accessibilityRole="button"
              onPress={() => onRemove(attachment.id)}
              style={styles.removeAttachmentButton}
            >
              <Text style={styles.headerActionText}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

function MobileMessageAttachmentList({
  attachments,
}: {
  attachments: MobileMessageAttachment[]
}) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <View style={styles.messageAttachmentList}>
      {attachments.map((attachment) => (
        <Pressable
          accessibilityLabel={`Open attachment ${attachment.fileName}`}
          accessibilityRole="button"
          key={attachment.id}
          onPress={() => {
            void openAttachment(attachment)
          }}
          style={styles.messageAttachmentCard}
        >
          {attachment.contentType.startsWith('image/') && attachment.downloadUrl ? (
            <Image source={{ uri: attachment.downloadUrl }} style={styles.messageAttachmentImage} />
          ) : (
            <View style={styles.messageAttachmentIcon}>
              <Text style={styles.messageAttachmentIconText}>
                {attachmentIconLabel(attachment)}
              </Text>
            </View>
          )}
          <View style={styles.messageAttachmentCopy}>
            <Text numberOfLines={1} style={styles.messageAttachmentName}>
              {attachment.fileName}
            </Text>
            <Text style={styles.attachmentMetaText}>
              {attachment.contentType} · {formatAttachmentSize(attachment.sizeBytes)}
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  )
}

function MobileMessageComponentList({
  components,
}: {
  components: MobileMessageComponent[]
}) {
  if (components.length === 0) {
    return null
  }

  return (
    <View style={styles.messageComponentList}>
      {components.map((component) => (
        <Pressable
          accessibilityLabel={`Bot action ${component.label}`}
          accessibilityRole="button"
          disabled
          key={component.id}
          style={[
            styles.messageComponentButton,
            component.disabled ? styles.disabledMessageComponentButton : null,
          ]}
        >
          <Text style={styles.messageComponentText}>{component.label}</Text>
        </Pressable>
      ))}
      <Text style={styles.componentCompatibilityNote}>
        Bot actions can be viewed here; use web or desktop to run them.
      </Text>
    </View>
  )
}

function MobileRichEmbedList({ embeds }: { embeds: MobileRichEmbed[] }) {
  if (embeds.length === 0) {
    return null
  }

  return (
    <View style={styles.embedList}>
      {embeds.map((embed, index) => (
        <MobileRichEmbedCard
          key={`${embed.title ?? embed.description ?? 'embed'}-${index}`}
          embed={embed}
        />
      ))}
    </View>
  )
}

function MobileRichEmbedCard({ embed }: { embed: MobileRichEmbed }) {
  return (
    <View
      accessibilityLabel={`Rich embed: ${mobileRichEmbedLabel(embed)}`}
      accessible
      style={[styles.embedCard, { borderLeftColor: mobileRichEmbedAccentColor(embed.color) }]}
    >
      {embed.author?.name ? <Text style={styles.embedAuthor}>{embed.author.name}</Text> : null}
      {embed.title ? <Text style={styles.embedTitle}>{embed.title}</Text> : null}
      {embed.description ? <Text style={styles.embedDescription}>{embed.description}</Text> : null}
      {embed.fields && embed.fields.length > 0 ? (
        <View style={styles.embedFields}>
          {embed.fields.map((field, index) => (
            <View key={`${field.name}-${index}`} style={styles.embedField}>
              <Text style={styles.embedFieldName}>{field.name}</Text>
              <Text style={styles.embedFieldValue}>{field.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {embed.footer?.text ? <Text style={styles.embedFooter}>{embed.footer.text}</Text> : null}
    </View>
  )
}

function mobileRichEmbedLabel(embed: MobileRichEmbed) {
  return embed.title ?? embed.author?.name ?? embed.description?.slice(0, 64) ?? 'Untitled'
}

function mobileRichEmbedAccentColor(color: number | undefined) {
  if (typeof color !== 'number' || !Number.isFinite(color)) {
    return '#4b5fc4'
  }

  const normalized = Math.max(0, Math.min(0xffffff, Math.trunc(color)))
  return `#${normalized.toString(16).padStart(6, '0')}`
}

function mobilePendingAttachmentFromPickerFile(
  file: DocumentPickerResponse,
  localUri: string,
  index: number,
): MobilePendingAttachment {
  return {
    id: `pending-${Date.now()}-${index}`,
    contentType: file.type ?? 'application/octet-stream',
    fileName: file.name ?? fallbackAttachmentFileName(file),
    localUri,
    sizeBytes: file.size ?? 1,
    uploadProgress: 0,
    uploadStatus: 'ready',
  }
}

function fallbackAttachmentFileName(file: Pick<DocumentPickerResponse, 'type' | 'uri'>) {
  const extension = file.type?.split('/').at(-1)?.replace(/[^a-z0-9]+/gi, '').toLowerCase()
  return `attachment-${Date.now()}${extension ? `.${extension}` : ''}`
}

async function mobileAttachmentBody(localUri: string): Promise<BodyInit> {
  const response = await fetch(localUri)
  if (!response.ok) {
    throw new Error(`Unable to read picked file: HTTP ${response.status}`)
  }

  return response.blob()
}

function mobileMessageAttachmentFromApiAttachment(
  attachment: MessageAttachment,
): MobileMessageAttachment {
  return {
    id: attachment.id,
    contentType: attachment.contentType,
    downloadUrl: attachment.downloadUrl ?? '',
    fileName: attachment.fileName,
    sizeBytes: attachment.sizeBytes,
    status: attachment.status,
  }
}

function mobileMessageAttachmentFromPendingAttachment(
  attachment: MobilePendingAttachment,
): MobileMessageAttachment {
  return {
    id: attachment.attachmentId ?? attachment.id,
    contentType: attachment.contentType,
    downloadUrl: attachment.downloadUrl ?? '',
    fileName: attachment.fileName,
    sizeBytes: attachment.sizeBytes,
    status: 'uploaded',
  }
}

async function openAttachment(attachment: MobileMessageAttachment) {
  if (!attachment.downloadUrl) {
    return
  }

  await Linking.openURL(attachment.downloadUrl)
}

function attachmentIconLabel(attachment: MobileMessageAttachment) {
  if (attachment.contentType === 'application/pdf') {
    return 'PDF'
  }
  if (attachment.contentType.startsWith('text/')) {
    return 'TXT'
  }
  if (attachment.contentType.includes('zip')) {
    return 'ZIP'
  }

  return 'FILE'
}

function formatAttachmentSize(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
}

function pendingAttachmentStatusLabel(attachment: MobilePendingAttachment) {
  switch (attachment.uploadStatus) {
    case 'failed':
      return attachment.errorMessage ?? 'Upload failed'
    case 'uploaded':
      return 'Uploaded'
    case 'uploading':
      return `Uploading ${Math.round((attachment.uploadProgress ?? 0) * 100)}%`
    case 'ready':
    case undefined:
      return 'Ready to send'
  }
}

function seedMobileMeetings(email: string): Meeting[] {
  const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const endsAt = new Date(Date.now() + 90 * 60 * 1000).toISOString()

  return [
    {
      id: 'local-alpha-meeting',
      organizationId: DEFAULT_MOBILE_ORGANIZATION_ID,
      spaceId: DEFAULT_MOBILE_SPACE_ID,
      channelId: 'general',
      createdByUserId: 'local-alpha-owner',
      title: 'OpenCord Local Alpha Standup',
      description: 'Mobile calendar, reminder, and meeting join UX smoke fixture.',
      status: 'scheduled',
      startsAt,
      endsAt,
      timezone: resolvedTimeZone(),
      joinSlug: 'mtg-local-alpha-standup',
      joinUrl: 'https://chat.example.com/join/mtg-local-alpha-standup',
      cancelledAt: null,
      attendees: [
        {
          id: 'local-alpha-attendee',
          meetingId: 'local-alpha-meeting',
          userId: null,
          email,
          displayName: email.split('@')[0] || 'Mobile user',
          role: 'required',
          responseStatus: 'needs_action',
        },
      ],
      reminders: [
        {
          id: 'local-alpha-reminder',
          meetingId: 'local-alpha-meeting',
          recipientUserId: null,
          recipientEmail: email,
          channel: 'in_app',
          offsetMinutes: 10,
          scheduledFor: new Date(Date.now() + 50 * 60 * 1000).toISOString(),
          status: 'pending',
        },
      ],
    },
  ]
}

function localMobileMeetingFromForm(
  form: MobileMeetingForm,
  {
    email,
    endsAt,
    serverUrl,
    startsAt,
    title,
  }: {
    email?: string
    endsAt: string
    serverUrl: string
    startsAt: string
    title: string
  },
): Meeting {
  const id = form.meetingId ?? `local-meeting-${Date.now()}`
  const joinSlug = `mtg-${slugOpenCordTitle(title)}-${id.replace(/[^a-z0-9]+/gi, '')}`

  return {
    id,
    organizationId: form.organizationId ?? DEFAULT_MOBILE_ORGANIZATION_ID,
    spaceId: form.spaceId ?? DEFAULT_MOBILE_SPACE_ID,
    channelId: form.channelId ?? null,
    createdByUserId: 'mobile-local',
    title,
    description: null,
    status: 'scheduled',
    startsAt,
    endsAt,
    timezone: resolvedTimeZone(),
    joinSlug,
    joinUrl: `${serverUrl.replace(/\/+$/, '')}/join/${joinSlug}`,
    cancelledAt: null,
    attendees: email
      ? [
          {
            id: `${id}-attendee`,
            meetingId: id,
            userId: null,
            email,
            displayName: email.split('@')[0] || email,
            role: 'required',
            responseStatus: 'needs_action',
          },
        ]
      : [],
    reminders: mobileMeetingRemindersForForm(form, email).map((reminder, index) => ({
      id: `${id}-reminder-${index}`,
      meetingId: id,
      recipientUserId: null,
      recipientEmail: reminder.recipientEmail ?? null,
      channel: reminder.channel,
      offsetMinutes: reminder.offsetMinutes,
      scheduledFor: new Date(
        new Date(startsAt).getTime() - reminder.offsetMinutes * 60_000,
      ).toISOString(),
      status: 'pending',
    })),
  }
}

function mobileMeetingRemindersForForm(form: MobileMeetingForm, email?: string | null) {
  if (form.reminderOffsetMinutes <= 0) {
    return []
  }

  return [
    {
      recipientEmail: email ?? undefined,
      channel: form.reminderChannel,
      offsetMinutes: form.reminderOffsetMinutes,
    },
  ]
}

function meetingOrganizationIdFromChannels(channels: Array<{ organizationId?: string }>) {
  return channels.find((channel) => channel.organizationId)?.organizationId ?? null
}

function meetingOrganizationIdFromMobileChannels(channels: MobileChannel[]) {
  return meetingOrganizationIdFromChannels(channels)
}

function defaultMeetingLocalDateTime() {
  const nextHour = new Date()
  nextHour.setMinutes(0, 0, 0)
  nextHour.setHours(nextHour.getHours() + 1)
  return dateToLocalDateTimeInput(nextHour)
}

function addMinutesToLocalDateTime(value: string, minutes: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return dateToLocalDateTimeInput(new Date(date.getTime() + minutes * 60_000))
}

function dateToLocalDateTimeInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function localDateTimeToIso(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function resolvedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function isServerBackedId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function incomingWebhookDetailFromShownToken(webhook: IncomingWebhookWithToken): IncomingWebhook {
  return {
    id: webhook.id,
    organizationId: webhook.organizationId,
    spaceId: webhook.spaceId,
    channelId: webhook.channelId,
    botUserId: webhook.botUserId,
    createdByUserId: webhook.createdByUserId,
    name: webhook.name,
    status: webhook.status,
    tokenLastFour: webhook.tokenLastFour,
    createdAt: webhook.createdAt,
  }
}

function mobileNotificationTargetForCurrentContext(
  state: MobileAppState,
): OpenCordNotificationRouteTarget | null {
  const selectedMessage = [...state.messages]
    .reverse()
    .find((message) => message.channelId === state.selectedChannelId)
  const messageTarget = selectedMessage
    ? mobileRouteTargetForMessage(state, selectedMessage.id)
    : null
  if (messageTarget?.kind === 'message') {
    return messageTarget
  }

  const channelTarget = mobileRouteTargetForChannel(state)
  return channelTarget?.kind === 'channel' ? channelTarget : null
}

function shortIdentifier(value?: string | null) {
  if (!value) {
    return 'Unavailable'
  }
  if (value.length <= 12) {
    return value
  }

  return `${value.slice(0, 8)}...${value.slice(-4)}`
}

function lastFourSecretLabel(value?: string | null) {
  return value ? `****${value}` : 'not issued'
}

function formatCompactDateTime(value: string) {
  const date = parseMeetingDate(value)
  if (!date) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(date)
}

function parseMeetingDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

async function ensureMobileWorkspaceChannels(
  client: ReturnType<typeof createOpenCordApiClient>,
  email: string,
): Promise<Channel[]> {
  const workspaceName = mobileWorkspaceName(email)
  const organizations = await client.listOrganizations()
  const organization =
    organizations[0] ??
    (await client.createOrganization({ name: `${workspaceName} Org` })).organization
  const spaces = await client.listSpaces(organization.id)
  const space =
    spaces[0] ?? (await client.createSpace(organization.id, { name: `${workspaceName} Space` })).space
  let channels = await client.listChannels(space.id)

  if (!channels.some((channel) => channel.kind === 'text')) {
    channels = [
      ...channels,
      await client.createChannel(space.id, {
        kind: 'text',
        name: 'general',
        topic: 'Mobile local alpha chat',
      }),
    ]
  }
  if (!channels.some((channel) => channel.kind === 'voice')) {
    channels = [
      ...channels,
      await client.createChannel(space.id, {
        kind: 'voice',
        name: 'standup',
        topic: 'Mobile voice check-in',
      }),
    ]
  }

  return channels
}

function mobileWorkspaceName(email: string) {
  return email.split('@')[0] || 'Mobile'
}

function mobileRealtimeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function mobileRealtimeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof OpenCordApiError && error.message) {
    return error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

function initialsForLabel(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)

  return (parts[0]?.[0] ?? 'O').concat(parts[1]?.[0] ?? '').toUpperCase()
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#151515',
  },
  loginPanel: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingBottom: 24,
    paddingHorizontal: 24,
    gap: 14,
  },
  brand: {
    color: '#f5f6f3',
    fontSize: 32,
    fontWeight: '800',
  },
  subtle: {
    color: '#aab2a8',
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 48,
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    paddingHorizontal: 14,
  },
  rememberDeviceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rememberDeviceCopy: {
    flex: 1,
    gap: 2,
  },
  rememberDeviceLabel: {
    color: '#f5f6f3',
    fontSize: 14,
    fontWeight: '800',
  },
  serverList: {
    gap: 8,
    marginTop: 6,
  },
  serverRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  serverSwitchButton: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 56,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  activeServerSwitchButton: {
    borderColor: '#28796d',
    backgroundColor: '#1d2b28',
  },
  serverName: {
    color: '#f5f6f3',
    fontSize: 14,
    fontWeight: '800',
  },
  removeServerButton: {
    alignItems: 'center',
    backgroundColor: '#353535',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 82,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#28796d',
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '800',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: 16,
    paddingTop: 0,
  },
  title: {
    color: '#f5f6f3',
    fontSize: 20,
    fontWeight: '800',
  },
  status: {
    color: '#86e0bb',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  mobileWorkspace: {
    flex: 1,
    flexDirection: 'row',
  },
  channelDrawer: {
    backgroundColor: '#151515',
    flex: 1,
  },
  drawerHeader: {
    alignItems: 'center',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 54,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  drawerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  drawerHeaderActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  drawerQuickActions: {
    borderBottomColor: '#242826',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  drawerQuickActionButton: {
    alignItems: 'center',
    backgroundColor: '#232428',
    borderColor: '#232428',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 10,
  },
  activeDrawerQuickActionButton: {
    backgroundColor: '#1d2b28',
    borderColor: '#28796d',
  },
  drawerQuickActionIcon: {
    color: '#86e0bb',
    fontSize: 13,
    fontWeight: '900',
  },
  drawerQuickActionText: {
    color: '#f2f3f5',
    fontSize: 12,
    fontWeight: '900',
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    minWidth: 58,
    paddingHorizontal: 8,
  },
  iconButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  drawerIconButton: {
    alignItems: 'center',
    backgroundColor: '#26272b',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  serverRail: {
    alignItems: 'center',
    backgroundColor: '#101010',
    borderRightColor: '#242826',
    borderRightWidth: 1,
    gap: 10,
    paddingHorizontal: 8,
    paddingTop: 10,
    width: 72,
  },
  serverRailList: {
    alignItems: 'center',
    gap: 10,
  },
  serverPill: {
    alignItems: 'center',
    backgroundColor: '#252525',
    borderColor: '#252525',
    borderRadius: 18,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  activeServerPill: {
    backgroundColor: '#1d2b28',
    borderColor: '#28796d',
    borderRadius: 14,
  },
  serverInitials: {
    color: '#f5f6f3',
    fontSize: 14,
    fontWeight: '900',
  },
  addServerPill: {
    alignItems: 'center',
    backgroundColor: '#1f2d29',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  addServerText: {
    color: '#86e0bb',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  serverPillName: {
    color: '#d8ddd5',
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 68,
  },
  serverManagerSheet: {
    backgroundColor: '#1d1d1d',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    gap: 10,
    padding: 12,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: '#f5f6f3',
    fontSize: 15,
    fontWeight: '900',
  },
  closeSheetButton: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  serverRailControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  serverRailInput: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  serverRailButton: {
    alignItems: 'center',
    backgroundColor: '#28796d',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 58,
  },
  serverRailRemoveButton: {
    alignItems: 'center',
    backgroundColor: '#353535',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 74,
  },
  removeCurrentServerButton: {
    alignItems: 'center',
    backgroundColor: '#353535',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 40,
  },
  meetingPanel: {
    backgroundColor: '#171819',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    maxHeight: 520,
    padding: 12,
  },
  meetingPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  meetingPanelScroll: {
    maxHeight: 420,
  },
  meetingEmptyState: {
    backgroundColor: '#202124',
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 82,
    padding: 12,
  },
  meetingEmptyTitle: {
    color: '#f2f3f5',
    fontSize: 14,
    fontWeight: '900',
  },
  meetingListCard: {
    alignItems: 'center',
    backgroundColor: '#202124',
    borderColor: '#2f3431',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    minHeight: 72,
    padding: 10,
  },
  selectedMeetingListCard: {
    backgroundColor: '#202a27',
    borderColor: '#28796d',
  },
  meetingCardTime: {
    color: '#86e0bb',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    width: 56,
  },
  meetingCardBody: {
    flex: 1,
    minWidth: 0,
  },
  meetingCardTitle: {
    color: '#f2f3f5',
    fontSize: 14,
    fontWeight: '900',
  },
  meetingChannelLabel: {
    color: '#cfd6cc',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  meetingDetailCard: {
    backgroundColor: '#202124',
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 4,
    padding: 12,
  },
  meetingDetailHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  meetingDetailTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  meetingDetailTitle: {
    color: '#f2f3f5',
    fontSize: 16,
    fontWeight: '900',
  },
  meetingStatusPill: {
    backgroundColor: '#35383d',
    borderRadius: 8,
    color: '#dbdee1',
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
    textTransform: 'uppercase',
  },
  activeMeetingStatusPill: {
    backgroundColor: '#28796d',
    color: '#ffffff',
  },
  meetingLinkBlock: {
    backgroundColor: '#18191b',
    borderRadius: 8,
    gap: 6,
    padding: 10,
  },
  meetingCodeText: {
    color: '#d7dbde',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    fontSize: 11,
    lineHeight: 16,
  },
  meetingInlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meetingDetailActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  meetingPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#28796d',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  meetingSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#35383d',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  meetingDangerButton: {
    alignItems: 'center',
    backgroundColor: '#623238',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 64,
    paddingHorizontal: 12,
  },
  meetingForm: {
    backgroundColor: '#202124',
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
    padding: 10,
  },
  meetingFormHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  meetingSectionTitle: {
    color: '#f2f3f5',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  meetingInput: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  meetingFormGrid: {
    gap: 8,
  },
  meetingReminderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  meetingReminderCopy: {
    flex: 1,
    minWidth: 0,
  },
  meetingReminderInput: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    minHeight: 40,
    paddingHorizontal: 10,
    textAlign: 'center',
    width: 72,
  },
  meetingReminderSummary: {
    backgroundColor: '#18191b',
    borderRadius: 8,
    gap: 4,
    padding: 10,
  },
  meetingFormActions: {
    alignItems: 'flex-end',
  },
  errorText: {
    color: '#ffb1a8',
    fontSize: 13,
    lineHeight: 18,
  },
  inlineError: {
    color: '#ffb1a8',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  settingsPanel: {
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    flexShrink: 1,
  },
  settingsPanelContent: {
    gap: 10,
    padding: 12,
  },
  settingsPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  settingsPanelTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  settingsTabs: {
    gap: 8,
    paddingBottom: 2,
  },
  settingsTab: {
    alignItems: 'center',
    backgroundColor: '#232428',
    borderColor: '#232428',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 10,
  },
  activeSettingsTab: {
    backgroundColor: '#1d2b28',
    borderColor: '#28796d',
  },
  settingsTabText: {
    color: '#d8ddd5',
    fontSize: 12,
    fontWeight: '800',
  },
  activeSettingsTabText: {
    color: '#86e0bb',
  },
  settingsSection: {
    gap: 8,
  },
  settingsInfoRow: {
    alignItems: 'center',
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    padding: 10,
  },
  settingsInfoValue: {
    color: '#f5f6f3',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    maxWidth: '48%',
  },
  settingsActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  developerCreateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  developerInput: {
    flex: 1,
    minWidth: 180,
  },
  developerCard: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  developerActionButton: {
    flexGrow: 0,
    minWidth: 82,
  },
  secondarySettingsButton: {
    alignItems: 'center',
    backgroundColor: '#353535',
    borderRadius: 8,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  dangerSettingsButton: {
    alignItems: 'center',
    backgroundColor: '#623238',
    borderRadius: 8,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  disabledSettingsButton: {
    opacity: 0.5,
  },
  permissionTitle: {
    color: '#f5f6f3',
    fontSize: 16,
    fontWeight: '800',
  },
  permissionRow: {
    alignItems: 'center',
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
    minHeight: 78,
    padding: 10,
  },
  permissionCopy: {
    flex: 1,
    gap: 2,
  },
  permissionLabel: {
    color: '#f5f6f3',
    fontSize: 14,
    fontWeight: '800',
  },
  permissionStatus: {
    color: '#86e0bb',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  permissionButton: {
    alignItems: 'center',
    backgroundColor: '#28796d',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 78,
    paddingHorizontal: 10,
  },
  flexList: {
    flex: 1,
  },
  navigatorContent: {
    gap: 16,
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  navigatorSection: {
    gap: 8,
  },
  sectionTitle: {
    color: '#949ba4',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: 8,
    textTransform: 'uppercase',
  },
  listContent: {
    padding: 12,
    gap: 10,
  },
  channelRow: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 6,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  selectedChannelRow: {
    backgroundColor: '#2b2d31',
  },
  channelGlyph: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 24,
  },
  selectedChannelGlyph: {
    backgroundColor: '#383a40',
    borderRadius: 6,
  },
  channelGlyphText: {
    color: '#949ba4',
    fontSize: 18,
    fontWeight: '900',
  },
  channelRowCopy: {
    flex: 1,
    gap: 1,
    paddingRight: 8,
  },
  channelName: {
    color: '#dbdee1',
    fontSize: 15,
    fontWeight: '800',
  },
  channelMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mentionBadge: {
    backgroundColor: '#c94d4d',
    borderRadius: 9,
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
    minWidth: 18,
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
    textAlign: 'center',
  },
  voiceOccupancy: {
    color: '#d8ddd5',
    fontSize: 12,
    fontWeight: '900',
  },
  unreadDot: {
    backgroundColor: '#4b5fc4',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  voiceConnectedLabel: {
    color: '#86e0bb',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  voiceTray: {
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  voiceTrayTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  voiceSummary: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  voiceTitle: {
    color: '#86e0bb',
    fontSize: 13,
    fontWeight: '900',
  },
  voiceCompactStatus: {
    color: '#aab2a8',
    fontSize: 12,
    lineHeight: 16,
  },
  voiceParticipants: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  voiceParticipant: {
    color: '#d8ddd5',
    fontSize: 12,
  },
  screenShareStrip: {
    minHeight: 126,
  },
  screenShareTile: {
    borderColor: '#343a37',
    borderRadius: 8,
    borderWidth: 1,
    height: 118,
    marginRight: 10,
    overflow: 'hidden',
    width: 190,
  },
  screenShareVideo: {
    backgroundColor: '#101010',
    height: 92,
    width: '100%',
  },
  screenShareLabel: {
    color: '#d8ddd5',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingTop: 5,
  },
  voiceActions: {
    flexDirection: 'row',
    gap: 6,
  },
  voiceIconButton: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  leaveVoiceButton: {
    backgroundColor: '#5d2f34',
  },
  chatHeader: {
    alignItems: 'center',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 54,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  iconOnlyButton: {
    alignItems: 'center',
    backgroundColor: '#26272b',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  activeIconOnlyButton: {
    backgroundColor: '#1d2b28',
    borderColor: '#28796d',
    borderWidth: 1,
  },
  iconOnlyButtonText: {
    color: '#dbdee1',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
    textAlign: 'center',
  },
  linkText: {
    color: '#86e0bb',
    fontWeight: '800',
  },
  channelTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  chatTitle: {
    color: '#f2f3f5',
    fontSize: 17,
    fontWeight: '900',
  },
  chatSubtitle: {
    color: '#949ba4',
    fontSize: 12,
    lineHeight: 16,
  },
  channelHeaderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
    maxWidth: 132,
  },
  searchPanel: {
    backgroundColor: '#171819',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    gap: 10,
    maxHeight: 360,
    padding: 12,
  },
  searchInput: {
    backgroundColor: '#101112',
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    minHeight: 42,
    paddingHorizontal: 12,
  },
  searchTabs: {
    flexGrow: 0,
  },
  searchTab: {
    alignItems: 'center',
    backgroundColor: '#232428',
    borderColor: '#232428',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    marginRight: 8,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  activeSearchTab: {
    backgroundColor: '#1d2b28',
    borderColor: '#28796d',
  },
  searchTabText: {
    color: '#d8ddd5',
    fontSize: 12,
    fontWeight: '800',
  },
  activeSearchTabText: {
    color: '#86e0bb',
  },
  searchResults: {
    maxHeight: 210,
  },
  searchResultsContent: {
    gap: 10,
  },
  searchResultSection: {
    gap: 6,
  },
  searchResultRow: {
    alignItems: 'center',
    backgroundColor: '#202124',
    borderColor: '#2f3431',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    padding: 10,
  },
  searchResultIcon: {
    color: '#86e0bb',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    width: 22,
  },
  searchResultCopy: {
    flex: 1,
    minWidth: 0,
  },
  searchResultTitle: {
    color: '#f2f3f5',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '900',
  },
  searchResultMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  searchStateRow: {
    alignItems: 'center',
    backgroundColor: '#202124',
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 62,
    padding: 12,
  },
  searchStateIcon: {
    color: '#86e0bb',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    width: 22,
  },
  searchStateText: {
    color: '#d8ddd5',
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  memberDrawer: {
    backgroundColor: '#171819',
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
    gap: 10,
    maxHeight: 360,
    padding: 12,
  },
  memberList: {
    maxHeight: 286,
  },
  memberListContent: {
    gap: 8,
  },
  memberRow: {
    alignItems: 'center',
    backgroundColor: '#202124',
    borderColor: '#2f3431',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 10,
  },
  memberAvatar: {
    alignItems: 'center',
    backgroundColor: '#26312f',
    borderRadius: 17,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  memberAvatarText: {
    color: '#86e0bb',
    fontSize: 12,
    fontWeight: '900',
  },
  presenceDot: {
    borderColor: '#202124',
    borderRadius: 5,
    borderWidth: 2,
    bottom: -1,
    height: 11,
    position: 'absolute',
    right: -1,
    width: 11,
  },
  presenceOnline: {
    backgroundColor: '#3ba55d',
  },
  presenceSpeaking: {
    backgroundColor: '#86e0bb',
  },
  presenceMuted: {
    backgroundColor: '#d6a94a',
  },
  presenceDeafened: {
    backgroundColor: '#d97b72',
  },
  presenceIdle: {
    backgroundColor: '#faa61a',
  },
  presenceOffline: {
    backgroundColor: '#747f8d',
  },
  memberCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  memberNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  memberName: {
    color: '#f2f3f5',
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  selfBadge: {
    backgroundColor: '#28796d',
    borderRadius: 4,
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  memberRole: {
    color: '#aab2a8',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headerActionButton: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 8,
  },
  headerActionText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  timeline: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 14,
  },
  messageGroup: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  ownMessageGroup: {
    flexDirection: 'row',
  },
  messageAvatar: {
    alignItems: 'center',
    backgroundColor: '#26312f',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  messageAvatarImage: {
    borderRadius: 16,
    height: 32,
    width: 32,
  },
  messageAvatarText: {
    color: '#86e0bb',
    fontSize: 12,
    fontWeight: '900',
  },
  messageGroupBody: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  messageGroupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  message: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderRadius: 4,
    maxWidth: '100%',
    paddingHorizontal: 0,
    paddingVertical: 2,
  },
  highlightedMessage: {
    backgroundColor: '#253430',
    paddingHorizontal: 8,
  },
  ownMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
  },
  messageAuthor: {
    color: '#f5f6f3',
    fontSize: 13,
    fontWeight: '800',
  },
  authorBadge: {
    backgroundColor: '#5865f2',
    borderRadius: 4,
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  messageContent: {
    color: '#edf1ea',
    fontSize: 15,
    lineHeight: 21,
  },
  mentionText: {
    backgroundColor: '#243c50',
    color: '#9bd1ff',
    fontWeight: '800',
  },
  replyPreview: {
    borderLeftColor: '#86e0bb',
    borderLeftWidth: 3,
    color: '#aab2a8',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6,
    paddingLeft: 8,
  },
  deletedMessage: {
    color: '#9ea49b',
    fontSize: 14,
    fontStyle: 'italic',
  },
  messageMeta: {
    color: '#aab2a8',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 6,
    textTransform: 'uppercase',
  },
  deliveryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#353535',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 10,
  },
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  reactionPill: {
    backgroundColor: '#2b2b2b',
    borderRadius: 12,
    color: '#f5f6f3',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  messageAttachmentList: {
    gap: 8,
    marginTop: 8,
  },
  messageAttachmentCard: {
    alignItems: 'center',
    backgroundColor: '#22252a',
    borderColor: '#3a4048',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    maxWidth: 340,
    minHeight: 64,
    overflow: 'hidden',
    padding: 8,
  },
  messageAttachmentImage: {
    backgroundColor: '#111315',
    borderRadius: 6,
    height: 74,
    width: 98,
  },
  messageAttachmentIcon: {
    alignItems: 'center',
    backgroundColor: '#31363f',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    width: 54,
  },
  messageAttachmentIconText: {
    color: '#f2f3f5',
    fontSize: 11,
    fontWeight: '900',
  },
  messageAttachmentCopy: {
    flex: 1,
    minWidth: 0,
  },
  messageAttachmentName: {
    color: '#e7e9ec',
    fontSize: 13,
    fontWeight: '900',
  },
  attachmentMetaText: {
    color: '#aeb4bc',
    fontSize: 11,
    marginTop: 2,
  },
  attachmentErrorText: {
    color: '#ffb4ac',
  },
  messageComponentList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    maxWidth: 340,
  },
  messageComponentButton: {
    alignItems: 'center',
    backgroundColor: '#5865f2',
    borderRadius: 6,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  disabledMessageComponentButton: {
    backgroundColor: '#3a3d42',
  },
  messageComponentText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  componentCompatibilityNote: {
    color: '#aab2a8',
    flexBasis: '100%',
    fontSize: 11,
    fontWeight: '700',
  },
  embedList: {
    gap: 8,
    marginTop: 8,
  },
  embedCard: {
    backgroundColor: '#1a1a1a',
    borderColor: '#343a37',
    borderLeftWidth: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    maxWidth: 320,
    minWidth: 0,
    padding: 10,
  },
  embedAuthor: {
    color: '#cfd6cc',
    fontSize: 12,
    fontWeight: '800',
  },
  embedTitle: {
    color: '#86c5ff',
    fontSize: 14,
    fontWeight: '800',
  },
  embedDescription: {
    color: '#d8ddd5',
    fontSize: 13,
    lineHeight: 18,
  },
  embedFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  embedField: {
    minWidth: 128,
  },
  embedFieldName: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  embedFieldValue: {
    color: '#cfd6cc',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  embedFooter: {
    color: '#9ea49b',
    fontSize: 11,
    marginTop: 2,
  },
  messageTime: {
    color: '#aab2a8',
    fontSize: 11,
  },
  messageActionSheet: {
    backgroundColor: '#1f2024',
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  actionSheetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  messageActionGrid: {
    gap: 6,
  },
  messageActionRow: {
    alignItems: 'center',
    backgroundColor: '#2b2d31',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  destructiveMessageActionButton: {
    backgroundColor: '#5d2f34',
  },
  messageActionIcon: {
    color: '#dbdee1',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    width: 22,
  },
  messageActionLabel: {
    color: '#ffffff',
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  composerContext: {
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  composerContextRow: {
    alignItems: 'center',
    backgroundColor: '#202020',
    borderLeftColor: '#86e0bb',
    borderLeftWidth: 3,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    padding: 10,
  },
  composerContextCopy: {
    flex: 1,
    minWidth: 0,
  },
  composerContextLabel: {
    color: '#f5f6f3',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  clearContextButton: {
    alignItems: 'center',
    backgroundColor: '#353535',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: 10,
  },
  composerFeedback: {
    color: '#86e0bb',
    fontSize: 12,
    fontWeight: '800',
  },
  composerDisabledReason: {
    color: '#aab2a8',
    fontSize: 12,
  },
  composer: {
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  composerIconButton: {
    alignItems: 'center',
    backgroundColor: '#2b2d31',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  disabledIconButton: {
    opacity: 0.45,
  },
  composerIconText: {
    color: '#dbdee1',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  composerInput: {
    backgroundColor: '#2b2d31',
    borderRadius: 18,
    borderWidth: 0,
    color: '#f5f6f3',
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#5865f2',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    minWidth: 56,
    paddingHorizontal: 12,
  },
  disabledSendButton: {
    backgroundColor: '#353535',
    opacity: 0.65,
  },
  pendingAttachmentScroller: {
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    maxHeight: 118,
  },
  pendingAttachmentList: {
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  pendingAttachmentCard: {
    backgroundColor: '#24272a',
    borderColor: '#3b4140',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    minHeight: 88,
    padding: 10,
    width: 210,
  },
  pendingAttachmentName: {
    color: '#f2f3f5',
    fontSize: 13,
    fontWeight: '900',
  },
  pendingAttachmentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  removeAttachmentButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#3a3d42',
    borderRadius: 7,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 9,
  },
  retryAttachmentButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#5865f2',
    borderRadius: 7,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 9,
  },
  accountBar: {
    alignItems: 'center',
    backgroundColor: '#1f2024',
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  accountAvatar: {
    alignItems: 'center',
    backgroundColor: '#5865f2',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  accountAvatarText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900',
  },
  accountCopy: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    color: '#f2f3f5',
    fontSize: 13,
    fontWeight: '900',
  },
  accountStatus: {
    color: '#949ba4',
    fontSize: 11,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 4,
  },
})
