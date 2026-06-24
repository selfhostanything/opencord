import type { MediaRoomToken } from '@opencord/api-client'
import { AudioSession, registerGlobals } from '@livekit/react-native'
import { Room, RoomEvent } from 'livekit-client'
import { Platform } from 'react-native'

import {
  nativeLiveKitServerUrlForPlatform,
} from './nativeMediaUrls'
import {
  createNativeCallIntegrationSession,
  type NativeCallIntegrationSession,
} from './nativeCallIntegration'
import {
  isNativeScreenSharePublication,
  nativeScreenShareStreamFromSubscription,
  nativeScreenShareStreamsFromParticipants,
  participantPublicationValues,
  resubscribeMissingNativeScreenShares,
  type NativeScreenShareStream,
} from './nativeScreenShareStreams'
import {
  registerNativeMediaRefreshListeners,
  startNativeMediaStatePoll,
} from './nativeRoomListeners'

export type NativeLiveKitVoiceState = {
  status: 'connecting' | 'connected' | 'disconnected'
  localAudioTracks: number
  remoteAudioTracks: number
  remoteScreenShares: number
  remoteScreenShareStreams: NativeScreenShareStream[]
}

export type ConnectNativeLiveKitVoiceOptions = {
  media: MediaRoomToken
  selfMute: boolean
  selfDeaf: boolean
  callDisplayName?: string
  onNativeCallEnded?: () => void
  onStateChange?: (state: NativeLiveKitVoiceState) => void
}

export type NativeLiveKitVoiceSession = {
  disconnect: () => Promise<void>
  setMuted: (muted: boolean) => Promise<void>
  setDeafened: (deafened: boolean) => Promise<void>
  snapshot: () => NativeLiveKitVoiceState
}

type NativePublication = {
  trackSid?: string
  source?: string
  isMuted?: boolean
  isSubscribed?: boolean
  kind?: string
  mediaStream?: {
    toURL?: () => string
  }
  name?: string
  trackName?: string
  track?: {
    kind?: string
    name?: string
    source?: string
    mediaStream?: {
      toURL?: () => string
    }
  }
  videoTrack?: {
    kind?: string
    name?: string
    source?: string
    mediaStream?: {
      toURL?: () => string
    }
  }
  setSubscribed?: (enabled: boolean) => void
}

type NativeParticipant = {
  identity?: string
  audioTrackPublications?: unknown
  getTrackPublication?: (source: string) => NativePublication | undefined
  off?: (event: string, listener: () => void) => unknown
  on?: (event: string, listener: () => void) => unknown
  videoTrackPublications?: unknown
  trackPublications?: unknown
}

type NativeRoom = {
  connect: (
    serverUrl: string,
    token: string,
    options?: { autoSubscribe?: boolean },
  ) => Promise<void>
  disconnect: () => void
  on: (event: string, listener: (...args: unknown[]) => void) => NativeRoom
  localParticipant: NativeParticipant & {
    setMicrophoneEnabled: (enabled: boolean) => Promise<void>
  }
  remoteParticipants?: unknown
  state?: string
}

export async function connectNativeLiveKitVoice(
  options: ConnectNativeLiveKitVoiceOptions,
): Promise<NativeLiveKitVoiceSession> {
  registerGlobals()
  await AudioSession.startAudioSession()

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
  }) as unknown as NativeRoom
  let nativeCallSession: NativeCallIntegrationSession | null = null
  let cleanedUp = false
  let stopRefreshListeners: () => void = () => {}
  let stopStatePoll: () => void = () => {}
  let lastDiagnosticSignature = ''
  let selfDeafened = options.selfDeaf
  let lastRemoteSubscriptionSignature = ''
  const screenShareResubscribeAttempts = new Map<string, number>()
  const subscribedScreenShareStreams = new Map<string, NativeScreenShareStream>()
  const currentSnapshot = (status: NativeLiveKitVoiceState['status']) =>
    snapshotNativeLiveKitVoice(
      room,
      status,
      Array.from(subscribedScreenShareStreams.values()),
    )
  const syncRemoteSubscriptions = () => {
    const subscribed = !selfDeafened
    const signature = remoteParticipants(room)
      .flatMap((participant, participantIndex) =>
        participantPublicationValues(participant).map(
          (publication, publicationIndex) =>
            `${participant.identity ?? participantIndex}:${publication.trackSid ?? publicationIndex}:${subscribed}`,
        ),
      )
      .sort()
      .join('|')
    if (signature === lastRemoteSubscriptionSignature) {
      if (subscribed) {
        logNativeScreenShareResubscribe(
          resubscribeMissingNativeScreenShares(room, screenShareResubscribeAttempts),
        )
      }
      return
    }
    lastRemoteSubscriptionSignature = signature
    setRemoteSubscriptions(room, subscribed)
    if (subscribed) {
      logNativeScreenShareResubscribe(
        resubscribeMissingNativeScreenShares(room, screenShareResubscribeAttempts),
      )
    }
  }
  const notifyCurrent = () => {
    syncRemoteSubscriptions()
    notify(nativeRoomState(room))
  }
  const notifyState = (state: NativeLiveKitVoiceState) => {
    logNativeMediaDiagnostics(room, state, (signature) => {
      if (signature === lastDiagnosticSignature) {
        return false
      }
      lastDiagnosticSignature = signature
      return true
    })
    options.onStateChange?.(state)
  }
  const notify = (status: NativeLiveKitVoiceState['status']) => {
    notifyState(currentSnapshot(status))
  }
  const captureSubscribedScreenShare = (
    track: unknown,
    publication: unknown,
    participant: unknown,
  ) => {
    logNativeTrackSubscribedEvent(track, publication, participant)
    const stream = nativeScreenShareStreamFromSubscription({
      participant: participant as NativeParticipant,
      publication: publication as NativePublication,
      track: track as NativePublication['track'],
    })
    if (!stream) {
      return
    }
    subscribedScreenShareStreams.set(stream.id, stream)
    notify('connected')
  }
  room.on(String(RoomEvent.TrackSubscribed), captureSubscribedScreenShare)
  room.on(String(RoomEvent.TrackUnsubscribed), (_track, publication) => {
    const trackSid = (publication as NativePublication | undefined)?.trackSid
    if (trackSid) {
      subscribedScreenShareStreams.delete(trackSid)
      notify('connected')
    }
  })

  const cleanup = async ({ endNativeCall }: { endNativeCall: boolean }) => {
    if (cleanedUp) {
      return
    }
    cleanedUp = true
    stopStatePoll()
    stopRefreshListeners()
    room.disconnect()
    await Promise.resolve(AudioSession.stopAudioSession())
    if (endNativeCall) {
      await nativeCallSession?.end()
    }
    notify('disconnected')
  }

  stopRefreshListeners = registerNativeMediaRefreshListeners(room, notifyCurrent)
  notify('connecting')
  const serverUrl = nativeLiveKitServerUrlForPlatform(options.media.serverUrl, Platform.OS)
  console.info(
    'OpenCord native media connect starting',
    JSON.stringify({
      grants: options.media.grants,
      participantIdentity: options.media.participantIdentity,
      platform: Platform.OS,
      roomName: options.media.roomName,
      serverUrl,
    }),
  )
  try {
    await room.connect(serverUrl, options.media.participantToken, {
      autoSubscribe: options.media.grants.canSubscribe,
    })
  } catch (error) {
    console.info(
      'OpenCord native media connect failed',
      JSON.stringify({
        error: nativeMediaErrorSummary(error),
        participantIdentity: options.media.participantIdentity,
        platform: Platform.OS,
        roomName: options.media.roomName,
        serverUrl,
      }),
    )
    await cleanup({ endNativeCall: false })
    throw error
  }
  if (options.media.grants.canPublishAudio) {
    await room.localParticipant.setMicrophoneEnabled(!options.selfMute)
  }
  syncRemoteSubscriptions()
  stopStatePoll = startNativeMediaStatePoll(notifyCurrent)
  nativeCallSession = await createNativeCallIntegrationSession({
    callUuid: options.media.participantIdentity,
    displayName: options.callDisplayName ?? options.media.roomName,
    handle: `opencord:${options.media.roomName}`,
    hasVideo: false,
    initialMuted: options.selfMute,
    onEnded: () => {
      void cleanup({ endNativeCall: false }).finally(options.onNativeCallEnded)
    },
    platform: Platform.OS,
  })
  notify('connected')

  return {
    async disconnect() {
      await cleanup({ endNativeCall: true })
    },
    async setMuted(muted: boolean) {
      if (options.media.grants.canPublishAudio) {
        await room.localParticipant.setMicrophoneEnabled(!muted)
      }
      await nativeCallSession?.setMuted(muted)
      notify('connected')
    },
    async setDeafened(deafened: boolean) {
      selfDeafened = deafened
      lastRemoteSubscriptionSignature = ''
      syncRemoteSubscriptions()
      notify('connected')
    },
    snapshot() {
      return currentSnapshot('connected')
    },
  }
}

function logNativeScreenShareResubscribe(queued: string[]) {
  if (queued.length === 0) {
    return
  }

  console.info(
    'OpenCord native screen share resubscribe queued',
    JSON.stringify({
      queued,
    }),
  )
}

function nativeMediaErrorSummary(error: unknown) {
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

function logNativeTrackSubscribedEvent(
  track: unknown,
  publication: unknown,
  participant: unknown,
) {
  const nativePublication = publication as NativePublication | undefined
  const nativeTrack = track as NativePublication['track'] | undefined
  const eventPublication = {
    ...(nativePublication ?? {}),
    track: nativeTrack ?? nativePublication?.track,
  }
  if (!nativePublication || !isNativeScreenSharePublication(eventPublication)) {
    return
  }

  console.info(
    'OpenCord native screen share subscribed event',
    JSON.stringify({
      participantIdentity: (participant as NativeParticipant | undefined)?.identity,
      publicationKind: nativePublication.kind,
      publicationSource: nativePublication.source,
      trackKind: nativeTrack?.kind,
      trackName: nativeTrack?.name,
      trackSource: nativeTrack?.source,
      trackSid: nativePublication.trackSid,
      hasTrackMediaStream: typeof nativeTrack?.mediaStream?.toURL === 'function',
      hasPublicationTrackMediaStream:
        typeof nativePublication.track?.mediaStream?.toURL === 'function',
      hasPublicationVideoTrackMediaStream:
        typeof nativePublication.videoTrack?.mediaStream?.toURL === 'function',
      publicationKeys: objectKeys(nativePublication),
      trackKeys: objectKeys(nativeTrack),
    }),
  )
}

function snapshotNativeLiveKitVoice(
  room: NativeRoom,
  status: NativeLiveKitVoiceState['status'],
  subscribedScreenShareStreams: NativeScreenShareStream[] = [],
): NativeLiveKitVoiceState {
  const participants = remoteParticipants(room)
  const remoteScreenShareStreams = uniqueScreenShareStreams([
    ...nativeScreenShareStreamsFromParticipants(room.remoteParticipants),
    ...subscribedScreenShareStreams,
  ])

  return {
    status,
    localAudioTracks: publicationValues(room.localParticipant.audioTrackPublications).filter(
      (publication) => !publication.isMuted,
    ).length,
    remoteAudioTracks: participants.flatMap((participant) =>
      publicationValues(participant.audioTrackPublications),
    ).length,
    remoteScreenShares: remoteScreenShareStreams.length,
    remoteScreenShareStreams,
  }
}

function uniqueScreenShareStreams(streams: NativeScreenShareStream[]) {
  const seen = new Set<string>()
  return streams.filter((stream) => {
    if (seen.has(stream.id)) {
      return false
    }
    seen.add(stream.id)
    return true
  })
}

function logNativeMediaDiagnostics(
  room: NativeRoom,
  state: NativeLiveKitVoiceState,
  shouldLog: (signature: string) => boolean,
) {
  const diagnostics = {
    status: state.status,
    localAudioTracks: state.localAudioTracks,
    remoteAudioTracks: state.remoteAudioTracks,
    remoteScreenShares: state.remoteScreenShares,
    remoteScreenShareStreams: state.remoteScreenShareStreams.map((stream) => ({
      id: stream.id,
      participantIdentity: stream.participantIdentity,
      hasStreamUrl: stream.streamUrl.length > 0,
    })),
    remoteParticipants: remoteParticipants(room).map((participant) => ({
      identity: participant.identity,
      publications: participantPublicationValues(participant).map((publication) => ({
        isMuted: publication.isMuted,
        isSubscribed: publication.isSubscribed,
        kind: publication.kind,
        name: publication.name,
        source: publication.source,
        trackHasMediaStream: typeof publication.track?.mediaStream?.toURL === 'function',
        trackKind: publication.track?.kind,
        trackName: publication.track?.name,
        trackSource: publication.track?.source,
        trackSid: publication.trackSid,
        videoTrackHasMediaStream:
          typeof publication.videoTrack?.mediaStream?.toURL === 'function',
        videoTrackKind: publication.videoTrack?.kind,
        videoTrackName: publication.videoTrack?.name,
        videoTrackSource: publication.videoTrack?.source,
      })),
    })),
  }
  const signature = JSON.stringify(diagnostics)
  if (shouldLog(signature)) {
    console.info('OpenCord native media state', signature)
  }
}

function setRemoteSubscriptions(room: NativeRoom, subscribed: boolean) {
  remoteParticipants(room)
    .flatMap((participant) => participantPublicationValues(participant))
    .forEach((publication) => {
      publication.setSubscribed?.(subscribed)
    })
}

function nativeRoomState(room: NativeRoom): NativeLiveKitVoiceState['status'] {
  return room.state === 'connected' ? 'connected' : 'disconnected'
}

function remoteParticipants(room: NativeRoom): NativeParticipant[] {
  return collectionValues(room.remoteParticipants)
}

function publicationValues(value: unknown): NativePublication[] {
  return collectionValues(value)
}

function collectionValues<T>(value: unknown): T[] {
  if (value instanceof Map) {
    return Array.from(value.values()) as T[]
  }
  if (Array.isArray(value)) {
    return value as T[]
  }
  if (value && typeof value === 'object' && 'values' in value) {
    const values = (value as { values?: unknown }).values
    if (typeof values === 'function') {
      return Array.from(values.call(value) as Iterable<unknown>) as T[]
    }
  }

  return []
}

function objectKeys(value: unknown) {
  if (!value || typeof value !== 'object') {
    return []
  }

  return Object.getOwnPropertyNames(value).sort()
}
