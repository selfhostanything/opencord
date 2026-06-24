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
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  createOpenCordApiClient,
  OpenCordApiError,
  type Channel,
} from '@opencord/api-client'
import {
  INITIAL_REALTIME_STATUS,
  createOpenCordRealtimeClient,
  type RealtimeIncomingEnvelope,
} from '@opencord/realtime'

import {
  activeMobileServerConnection,
  createInitialMobileState,
  mobileDefaultOpenCordServerUrlForPlatform,
  mobileChannelsFromApiChannels,
  mobileCanListenToVoice,
  mobileCanSpeakInVoice,
  mobileMediaPermissionRows,
  messagesForChannel,
  mobileReducer,
  mobileVoiceParticipantsForChannel,
  selectedChannel,
  type MobileChannel,
  type MobileMediaPermissionKind,
  type MobileMediaPermissionRow,
  type MobileMessage,
  type MobileRichEmbed,
  type MobileVoiceParticipant,
} from './src/mobileState'
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
  const lastE2EStateSignatureRef = useRef<string | null>(null)
  const lastE2ECommandIdRef = useRef<string | null>(null)
  const voiceSessionRef = useRef<NativeLiveKitVoiceSession | null>(null)
  const stateRef = useRef(state)
  const [serverUrl, setServerUrl] = useState(state.serverUrl)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginStatus, setLoginStatus] = useState<'idle' | 'loading'>('idle')
  const [composerText, setComposerText] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const activeChannel = selectedChannel(state)
  const activeServer = activeMobileServerConnection(state)
  const visibleMessages = useMemo(() => messagesForChannel(state), [state])
  const permissionRows = useMemo(() => mobileMediaPermissionRows(state), [state])
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
    } catch (error) {
      setLoginError(errorMessage(error, 'Unable to log in.'))
    } finally {
      setLoginStatus('idle')
    }
  }

  function switchServer(connectionId: string) {
    dispatch({ type: 'server.switch', connectionId })
  }

  function sendMessage() {
    dispatch({ type: 'message.send', content: composerText })
    setComposerText('')
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
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Channels</Text>
            <Text style={styles.subtle}>{activeServer?.displayName ?? state.serverUrl}</Text>
          </View>
          <View style={styles.headerActions}>
            <Text style={styles.status}>{state.realtimeStatus}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSettingsOpen((current) => !current)}
              style={styles.settingsButton}
            >
              <Text style={styles.primaryButtonText}>Voice & Video</Text>
            </Pressable>
          </View>
        </View>
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
        <FlatList
          data={state.channels}
          keyExtractor={(channel) => channel.id}
          style={styles.flexList}
          renderItem={({ item }) => (
            <ChannelRow
              channel={item}
              connected={state.voice.connectedChannelId === item.id}
              onPress={() => {
                if (item.kind === 'voice') {
                  void joinMobileVoice(item.id)
                  return
                }

                dispatch({ type: 'channel.select', channelId: item.id })
              }}
            />
          )}
          contentContainerStyle={styles.listContent}
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
      </View>
    )
  }

  return (
    <View style={shellStyle}>
      <StatusBar backgroundColor="#151515" barStyle="light-content" />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'channel.back' })}>
          <Text style={styles.linkText}>Channels</Text>
        </Pressable>
        <View style={styles.channelTitleBlock}>
          <Text style={styles.title}># {activeChannel.name}</Text>
          <Text style={styles.subtle}>{activeChannel.topic}</Text>
        </View>
      </View>
      <FlatList
        data={visibleMessages}
        keyExtractor={(message) => message.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        style={styles.flexList}
        contentContainerStyle={styles.timeline}
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
      <View style={styles.composer}>
        <TextInput
          accessibilityLabel="Message composer"
          onChangeText={setComposerText}
          placeholder={`Message #${activeChannel.name}`}
          placeholderTextColor="#7f877d"
          style={styles.composerInput}
          value={composerText}
        />
        <Pressable accessibilityRole="button" onPress={sendMessage} style={styles.sendButton}>
          <Text style={styles.primaryButtonText}>Send</Text>
        </Pressable>
      </View>
    </View>
  )
}

function ChannelRow({
  channel,
  connected,
  onPress,
}: {
  channel: MobileChannel
  connected: boolean
  onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.channelRow}>
      <View>
        <Text style={styles.channelName}>
          {channel.kind === 'voice' ? 'V' : '#'} {channel.name}
        </Text>
        <Text style={styles.subtle}>{channel.topic}</Text>
      </View>
      {connected ? <Text style={styles.voiceConnectedLabel}>Voice</Text> : null}
      {channel.unread ? <View style={styles.unreadDot} /> : null}
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
      <View style={styles.voiceSummary}>
        <Text style={styles.voiceTitle}>{voiceStatusLabel(status)}</Text>
        <Text style={styles.subtle}>{channelName}</Text>
        <Text style={styles.subtle}>
          {canListen ? 'Listening' : 'Deafened'} / {canSpeak ? 'Speaking' : 'Muted'}
        </Text>
        {remoteScreenShares > 0 ? (
          <Text style={styles.subtle}>Watching {remoteScreenShares} screen share</Text>
        ) : null}
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      </View>
      <RemoteScreenShareStrip streams={remoteScreenShareStreams} />
      <View style={styles.voiceParticipants}>
        {participants.map((participant) => (
          <Text key={participant.id} style={styles.voiceParticipant}>
            {participant.name} -{' '}
            {participant.self ? voiceSelfStatus(selfMute, selfDeaf) : participant.status}
          </Text>
        ))}
      </View>
      <View style={styles.voiceActions}>
        <Pressable accessibilityRole="button" onPress={onToggleMute} style={styles.voiceButton}>
          <Text style={styles.primaryButtonText}>{selfMute ? 'Unmute' : 'Mute'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onToggleDeaf} style={styles.voiceButton}>
          <Text style={styles.primaryButtonText}>{selfDeaf ? 'Undeaf' : 'Deaf'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onLeave} style={styles.voiceButton}>
          <Text style={styles.primaryButtonText}>Leave</Text>
        </Pressable>
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

function MessageBubble({ message }: { message: MobileMessage }) {
  return (
    <View style={[styles.message, message.own ? styles.ownMessage : null]}>
      <Text style={styles.messageAuthor}>{message.authorName}</Text>
      {message.content ? <Text style={styles.messageContent}>{message.content}</Text> : null}
      <MobileRichEmbedList embeds={message.embeds} />
      <Text style={styles.messageTime}>{message.time}</Text>
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
    paddingTop: 4,
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
  listContent: {
    padding: 12,
    gap: 10,
  },
  channelRow: {
    alignItems: 'center',
    backgroundColor: '#202020',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 72,
    padding: 14,
  },
  channelName: {
    color: '#f5f6f3',
    fontSize: 16,
    fontWeight: '800',
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
    gap: 10,
    padding: 12,
  },
  voiceSummary: {
    gap: 2,
  },
  voiceTitle: {
    color: '#f5f6f3',
    fontSize: 15,
    fontWeight: '800',
  },
  voiceParticipants: {
    gap: 4,
  },
  voiceParticipant: {
    color: '#d8ddd5',
    fontSize: 13,
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
    gap: 8,
  },
  voiceButton: {
    alignItems: 'center',
    backgroundColor: '#2b2b2b',
    borderRadius: 8,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
  },
  linkText: {
    color: '#86e0bb',
    fontWeight: '800',
  },
  channelTitleBlock: {
    flex: 1,
  },
  timeline: {
    padding: 12,
    gap: 10,
  },
  message: {
    alignSelf: 'flex-start',
    backgroundColor: '#202020',
    borderRadius: 8,
    maxWidth: '88%',
    padding: 12,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#203e36',
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
    marginTop: 4,
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
    marginTop: 6,
  },
  composer: {
    borderTopColor: '#2b2f2d',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  composerInput: {
    borderColor: '#333a36',
    borderRadius: 8,
    borderWidth: 1,
    color: '#f5f6f3',
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: '#28796d',
    borderRadius: 8,
    justifyContent: 'center',
    minWidth: 72,
  },
})
