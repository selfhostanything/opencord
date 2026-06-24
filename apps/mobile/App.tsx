import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { RTCView } from '@livekit/react-native-webrtc'
import Clipboard from '@react-native-clipboard/clipboard'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  createOpenCordApiClient,
  OpenCordApiError,
  type AuthResult,
  type Channel,
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
  activeMobileServerConnection,
  createInitialMobileState,
  mobileDefaultOpenCordServerUrlForPlatform,
  mobileChannelsFromApiChannels,
  mobileCanListenToVoice,
  mobileCanSpeakInVoice,
  mobileComposerState,
  mobileMentionTokens,
  mobileMessageActionSheetOptions,
  mobileMessageTimelineGroups,
  mobileMediaPermissionRows,
  mobileRouteTargetForChannel,
  mobileWorkspaceNavigatorSections,
  mobileReducer,
  mobileVoiceParticipantsForChannel,
  selectedChannel,
  type MobileChannel,
  type MobileMessageActionId,
  type MobileMessageActionOption,
  type MobileMessageTimelineGroup,
  type MobileMediaPermissionKind,
  type MobileMediaPermissionRow,
  type MobileMessage,
  type MobileRichEmbed,
  type MobileWorkspaceChannelRow,
  type MobileVoiceParticipant,
} from './src/mobileState'
import {
  useMobileChatStore,
  useMobileSessionStore,
  useMobileSettingsStore,
} from './src/mobileStores'
import { createMobileDeviceSessionStores } from './src/mobileDeviceSessionStorage'
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
  serverUrl: string
}

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
  const e2eCommandPollInFlightRef = useRef(false)
  const e2eLoginStartedRef = useRef(false)
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
  const replyTarget = useMobileChatStore((store) => store.replyTarget)
  const setMobileComposerText = useMobileChatStore((store) => store.setComposerText)
  const setMobileAccountMetadata = useMobileSessionStore((store) => store.setAccountMetadata)
  const setMobileRouteTarget = useMobileSessionStore((store) => store.setRouteTarget)
  const openMobileSettingsPanel = useMobileSettingsStore((store) => store.openPanel)
  const [serverUrl, setServerUrl] = useState(state.serverUrl)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading'>('idle')
  const [chatFeedback, setChatFeedback] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [serverManagerOpen, setServerManagerOpen] = useState(false)
  const activeChannel = selectedChannel(state)
  const activeServer = activeMobileServerConnection(state)
  const composerText = composerTextByChannelId[state.selectedChannelId] ?? ''
  const timelineGroups = useMemo(() => mobileMessageTimelineGroups(state), [state])
  const permissionRows = useMemo(() => mobileMediaPermissionRows(state), [state])
  const workspaceSections = useMemo(() => mobileWorkspaceNavigatorSections(state), [state])
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
        replyTargetMessageId: replyTarget?.messageId,
      }),
    [composerText, editTarget?.messageId, replyTarget?.messageId, state],
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
  const permissionPanelMaxHeight = Math.min(560, Math.max(300, height * 0.58))

  useEffect(() => {
    setServerUrl(state.serverUrl)
  }, [state.serverUrl])

  useEffect(() => {
    stateRef.current = state
  }, [state])

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
        serverUrl: e2eLaunchConfig.serverUrl,
      }),
    )
    setServerUrl(e2eLaunchConfig.serverUrl)
    setEmail(e2eLaunchConfig.email)
    setPassword(e2eLaunchConfig.password)
    if (e2eLaunchConfig.demoWorkspace) {
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
    if (!e2eLaunchConfig) {
      return
    }

    const handleUrl = ({ url }: { url: string }) => {
      runMobileE2ECommand(mobileE2ECommandFromUrl(url))
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
  }, [e2eLaunchConfig, state.voice.connectedChannelId, state.voice.selfDeaf, state.voice.selfMute])

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
    if (e2eLaunchConfig || state.screen !== 'login' || loginStatus === 'loading') {
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

  async function submitLogin(credentials?: MobileLoginCredentials) {
    const loginServerUrl = credentials?.serverUrl ?? serverUrl
    const loginEmail = credentials?.email ?? email
    const loginPassword = credentials?.password ?? password

    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Email and password are required.')
      return
    }

    setLoginStatus('loading')
    setLoginError(null)
    try {
      const authClient = createOpenCordApiClient({ baseUrl: loginServerUrl })
      const authResult = await authClient.login({ email: loginEmail, password: loginPassword })
      await persistMobileDeviceSession(loginServerUrl, authResult)
      const client = createOpenCordApiClient({
        baseUrl: loginServerUrl,
        sessionToken: authResult.session.token,
      })
      const channels = await ensureMobileWorkspaceChannels(client, authResult.user.email)
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
      await persistMobileDeviceSession(storedSession.serverUrl, authResult)
      const client = createOpenCordApiClient({
        baseUrl: storedSession.serverUrl,
        sessionToken: authResult.session.token,
      })
      const channels = await ensureMobileWorkspaceChannels(client, authResult.user.email)
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
      setLoginError(errorMessage(error, 'Saved login expired. Please log in again.'))
    } finally {
      setLoginStatus('idle')
    }
  }

  async function persistMobileDeviceSession(
    serverUrl: string,
    authResult: AuthResult,
  ) {
    if (!authResult.session.refreshToken) {
      return
    }

    await persistDeviceSession(mobileDeviceSessionStoresRef.current, {
      accountEmail: authResult.user.email,
      displayName: authResult.user.displayName,
      refreshToken: authResult.session.refreshToken,
      serverUrl,
      userId: authResult.user.id,
    })
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

  function toggleVoiceSettings() {
    openMobileSettingsPanel('voice-video')
    setSettingsOpen((current) => !current)
  }

  function sendMessage() {
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
      dispatch({
        type: 'message.send',
        content: composerText,
        replyToMessageId: replyTarget?.messageId,
      })
    }
    clearMobileComposer(state.selectedChannelId)
    clearMobileDraftTarget()
    setChatFeedback(null)
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
                  onPress={toggleVoiceSettings}
                  style={styles.drawerIconButton}
                >
                  <Text style={styles.iconOnlyButtonText}>⚙</Text>
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
              <PermissionSettingsPanel
                maxHeight={permissionPanelMaxHeight}
                onOpenSettings={openNativePermissionSettings}
                onRequest={requestPermission}
                rows={permissionRows}
              />
            ) : null}
            {state.voice.errorMessage ? (
              <Text style={styles.inlineError}>{state.voice.errorMessage}</Text>
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
        onBack={() => dispatch({ type: 'channel.back' })}
        onOpenSettings={() => {
          openMobileSettingsPanel('account')
          setSettingsOpen(true)
        }}
      />
      {settingsOpen ? (
        <PermissionSettingsPanel
          maxHeight={permissionPanelMaxHeight}
          onOpenSettings={openNativePermissionSettings}
          onRequest={requestPermission}
          rows={permissionRows}
        />
      ) : null}
      <FlatList
        data={timelineGroups}
        keyExtractor={(group) => group.id}
        renderItem={({ item }) => (
          <MessageGroup
            group={item}
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
      <View style={styles.composer}>
        <Pressable accessibilityLabel="Add attachment" accessibilityRole="button" style={styles.composerIconButton}>
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
          onPress={sendMessage}
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
  onBack,
  onOpenSettings,
}: {
  channel: MobileChannel
  onBack: () => void
  onOpenSettings: () => void
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
        <IconButton accessibilityLabel="Search messages" icon="⌕" onPress={() => undefined} />
        <IconButton accessibilityLabel="Open members" icon="@" onPress={() => undefined} />
        <IconButton accessibilityLabel="Open channel settings" icon="⚙" onPress={onOpenSettings} />
      </View>
    </View>
  )
}

function IconButton({
  accessibilityLabel,
  icon,
  onPress,
}: {
  accessibilityLabel: string
  icon: string
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.iconOnlyButton}
    >
      <Text style={styles.iconOnlyButtonText}>{icon}</Text>
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

function PermissionSettingsPanel({
  maxHeight,
  onOpenSettings,
  onRequest,
  rows,
}: {
  maxHeight: number
  onOpenSettings: () => void
  onRequest: (kind: MobileMediaPermissionKind) => void
  rows: MobileMediaPermissionRow[]
}) {
  return (
    <ScrollView
      contentContainerStyle={styles.permissionPanelContent}
      nestedScrollEnabled
      style={[styles.permissionPanel, { maxHeight }]}
    >
      <Text style={styles.permissionTitle}>Voice & Video</Text>
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
    </ScrollView>
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
  onLongPress,
  onRetry,
}: {
  group: MobileMessageTimelineGroup
  onLongPress: (message: MobileMessage) => void
  onRetry: (messageId: string) => void
}) {
  return (
    <View style={[styles.messageGroup, group.own ? styles.ownMessageGroup : null]}>
      <View style={styles.messageAvatar}>
        <Text style={styles.messageAvatarText}>{initialsForLabel(group.authorName)}</Text>
      </View>
      <View style={styles.messageGroupBody}>
        <View style={styles.messageGroupHeader}>
          <Text style={styles.messageAuthor}>{group.authorName}</Text>
          <Text style={styles.messageTime}>{group.messages[0]?.time}</Text>
        </View>
        {group.messages.map((message) => (
          <MessageBubble
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
  message,
  onLongPress,
  onRetry,
}: {
  message: MobileMessage
  onLongPress: () => void
  onRetry: () => void
}) {
  return (
    <Pressable
      accessibilityLabel={`Message from ${message.authorName}`}
      accessibilityRole="button"
      onLongPress={onLongPress}
      style={[styles.message, message.own ? styles.ownMessage : null]}
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
      <MobileRichEmbedList embeds={message.embeds} />
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
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
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
  permissionPanel: {
    borderBottomColor: '#2b2f2d',
    borderBottomWidth: 1,
  },
  permissionPanelContent: {
    padding: 12,
  },
  permissionTitle: {
    color: '#f5f6f3',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
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
    gap: 8,
    minHeight: 54,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  iconOnlyButton: {
    alignItems: 'center',
    backgroundColor: '#26272b',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  iconOnlyButtonText: {
    color: '#dbdee1',
    fontSize: 18,
    fontWeight: '900',
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
    maxWidth: 116,
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
  ownMessage: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
  },
  messageAuthor: {
    color: '#f5f6f3',
    fontSize: 13,
    fontWeight: '800',
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
