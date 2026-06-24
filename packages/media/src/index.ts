import {
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client'

export type MediaTokenGrants = {
  canPublishAudio: boolean
  canPublishVideo: boolean
  canPublishScreen: boolean
  canSubscribe: boolean
}

export type ConnectLiveKitVoiceOptions = {
  serverUrl: string
  participantToken: string
  roomName: string
  participantIdentity: string
  grants: MediaTokenGrants
  selfMute?: boolean
  selfDeaf?: boolean
  rtcConfig?: RTCConfiguration
  audioElementContainer?: HTMLElement | null
  screenShareElementContainer?: HTMLElement | null
  onStateChange?: (state: LiveKitVoiceState) => void
}

export type LiveKitVoiceState = {
  status: 'connecting' | 'connected' | 'disconnected'
  roomName: string
  participantIdentity: string
  localAudioPublications: LiveKitTrackPublicationState[]
  localScreenSharePublications: LiveKitTrackPublicationState[]
  remoteParticipants: LiveKitRemoteParticipantState[]
}

export type LiveKitRemoteParticipantState = {
  identity: string
  audioPublications: LiveKitTrackPublicationState[]
  screenSharePublications: LiveKitTrackPublicationState[]
}

export type LiveKitTrackPublicationState = {
  sid: string
  kind: string
  source: string
  muted: boolean
}

export type LiveKitVoiceSession = {
  roomName: string
  participantIdentity: string
  publishScreenShare: (stream: MediaStream) => Promise<void>
  setMuted: (muted: boolean) => Promise<void>
  setDeafened: (deafened: boolean) => Promise<void>
  stopScreenShare: () => Promise<void>
  disconnect: () => Promise<void>
  snapshot: () => LiveKitVoiceState
}

type MediaAttachment = {
  participantIdentity: string
  trackSid: string
  mediaElement: HTMLMediaElement
  rootElement: HTMLElement
  track: RemoteTrack
}

type LiveKitVoiceDiagnosticsSession = {
  roomName: string
  participantIdentity: string
  snapshot: () => LiveKitVoiceState
}

declare global {
  interface Window {
    __opencordMediaDiagnostics__?: {
      voiceSessions: LiveKitVoiceDiagnosticsSession[]
    }
  }
}

export async function connectLiveKitVoice(
  options: ConnectLiveKitVoiceOptions,
): Promise<LiveKitVoiceSession> {
  const room = new Room({ adaptiveStream: false, dynacast: false })
  const audioAttachments = new Map<string, MediaAttachment>()
  const screenShareAttachments = new Map<string, MediaAttachment>()
  let screenShareTracks: LocalVideoTrack[] = []
  let muted = options.selfMute ?? false
  let deafened = options.selfDeaf ?? false

  const notify = (status: LiveKitVoiceState['status']) => {
    options.onStateChange?.(snapshotVoiceRoom(room, options, status))
  }

  room
    .on(RoomEvent.Connected, () => notify('connected'))
    .on(RoomEvent.Disconnected, () => {
      detachAllRemoteMedia(audioAttachments)
      detachAllRemoteMedia(screenShareAttachments)
      notify('disconnected')
    })
    .on(RoomEvent.LocalTrackPublished, () => notify(roomState(room)))
    .on(RoomEvent.LocalTrackUnpublished, () => notify(roomState(room)))
    .on(RoomEvent.ParticipantConnected, () => notify(roomState(room)))
    .on(RoomEvent.ParticipantDisconnected, (participant) => {
      detachRemoteMediaForParticipant(audioAttachments, participant.identity)
      detachRemoteMediaForParticipant(screenShareAttachments, participant.identity)
      notify(roomState(room))
    })
    .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      attachRemoteAudio(options.audioElementContainer, audioAttachments, track, publication, participant)
      attachRemoteScreenShare(
        options.screenShareElementContainer,
        screenShareAttachments,
        track,
        publication,
        participant,
      )
      notify(roomState(room))
    })
    .on(RoomEvent.TrackUnsubscribed, (_track, publication, participant) => {
      detachRemoteMedia(audioAttachments, attachmentKey(participant.identity, publication.trackSid))
      detachRemoteMedia(
        screenShareAttachments,
        attachmentKey(participant.identity, publication.trackSid),
      )
      notify(roomState(room))
    })
    .on(RoomEvent.TrackMuted, () => notify(roomState(room)))
    .on(RoomEvent.TrackUnmuted, () => notify(roomState(room)))

  notify('connecting')
  await room.connect(options.serverUrl, options.participantToken, {
    autoSubscribe: true,
    rtcConfig: options.rtcConfig,
  })
  if (options.grants.canPublishAudio) {
    await room.localParticipant.setMicrophoneEnabled(!muted && !deafened)
  }
  notify('connected')

  const session: LiveKitVoiceSession = {
    roomName: options.roomName,
    participantIdentity: options.participantIdentity,
    async publishScreenShare(stream: MediaStream) {
      if (!options.grants.canPublishScreen) {
        throw new Error('Screen share is not allowed for this room')
      }

      await stopPublishedScreenShare(room, screenShareTracks, () => {
        screenShareTracks = []
      })
      const mediaTracks = stream.getVideoTracks()
      if (mediaTracks.length === 0) {
        throw new Error('Screen share stream has no video track')
      }

      const tracks = mediaTracks.map((track) => {
        const localTrack = new LocalVideoTrack(track, undefined, false)
        localTrack.source = Track.Source.ScreenShare
        return localTrack
      })
      screenShareTracks = tracks
      try {
        await Promise.all(
          tracks.map(async (track) => {
            track.mediaStreamTrack.addEventListener(
              'ended',
              () => {
                void stopPublishedScreenShare(room, screenShareTracks, () => {
                  screenShareTracks = []
                  notify(roomState(room))
                })
              },
              { once: true },
            )
            await room.localParticipant.publishTrack(track, { name: 'screen' })
          }),
        )
        await waitForLocalScreenSharePublication(room, tracks.length)
        notify(roomState(room))
      } catch (error) {
        await stopPublishedScreenShare(room, screenShareTracks, () => {
          screenShareTracks = []
        })
        notify(roomState(room))
        throw error
      }
    },
    async setMuted(nextMuted: boolean) {
      muted = nextMuted
      if (options.grants.canPublishAudio) {
        await room.localParticipant.setMicrophoneEnabled(!muted && !deafened)
      }
      notify(roomState(room))
    },
    async setDeafened(nextDeafened: boolean) {
      deafened = nextDeafened
      if (options.grants.canPublishAudio) {
        await room.localParticipant.setMicrophoneEnabled(!muted && !deafened)
      }
      notify(roomState(room))
    },
    async stopScreenShare() {
      await stopPublishedScreenShare(room, screenShareTracks, () => {
        screenShareTracks = []
      })
      notify(roomState(room))
    },
    async disconnect() {
      await stopPublishedScreenShare(room, screenShareTracks, () => {
        screenShareTracks = []
      })
      await room.disconnect()
      detachAllRemoteMedia(audioAttachments)
      detachAllRemoteMedia(screenShareAttachments)
      notify('disconnected')
    },
    snapshot() {
      return snapshotVoiceRoom(room, options, roomState(room))
    },
  }
  const unregisterDiagnosticsSession = registerDiagnosticsSession(session)

  const originalDisconnect = session.disconnect
  session.disconnect = async () => {
    unregisterDiagnosticsSession()
    await originalDisconnect()
  }

  return session
}

function roomState(room: Room): LiveKitVoiceState['status'] {
  return room.state === 'connected' ? 'connected' : 'disconnected'
}

function snapshotVoiceRoom(
  room: Room,
  options: ConnectLiveKitVoiceOptions,
  status: LiveKitVoiceState['status'],
): LiveKitVoiceState {
  return {
    status,
    roomName: options.roomName,
    participantIdentity: options.participantIdentity,
    localAudioPublications: Array.from(room.localParticipant.audioTrackPublications.values())
      .filter((publication) => publication.source === Track.Source.Microphone)
      .map(publicationState),
    localScreenSharePublications: Array.from(
      room.localParticipant.videoTrackPublications.values(),
    )
      .filter(isScreenSharePublication)
      .map(publicationState),
    remoteParticipants: Array.from(room.remoteParticipants.values()).map((participant) => ({
      identity: participant.identity,
      audioPublications: Array.from(participant.audioTrackPublications.values())
        .filter((publication) => publication.source === Track.Source.Microphone)
        .map(publicationState),
      screenSharePublications: Array.from(participant.videoTrackPublications.values())
        .filter(isScreenSharePublication)
        .map(publicationState),
    })),
  }
}

function publicationState(publication: LocalTrackPublication | RemoteTrackPublication) {
  return {
    sid: publication.trackSid,
    kind: publication.kind,
    source: publication.source,
    muted: publication.isMuted,
  }
}

function attachRemoteAudio(
  container: HTMLElement | null | undefined,
  attachments: Map<string, MediaAttachment>,
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
) {
  if (!container || track.kind !== Track.Kind.Audio) {
    return
  }

  const key = attachmentKey(participant.identity, publication.trackSid)
  if (attachments.has(key)) {
    return
  }

  const element = track.attach()
  element.autoplay = true
  element.dataset.opencordRemoteAudio = participant.identity
  container.append(element)
  attachments.set(key, {
    participantIdentity: participant.identity,
    trackSid: publication.trackSid,
    mediaElement: element,
    rootElement: element,
    track,
  })
}

function attachRemoteScreenShare(
  container: HTMLElement | null | undefined,
  attachments: Map<string, MediaAttachment>,
  track: RemoteTrack,
  publication: RemoteTrackPublication,
  participant: RemoteParticipant,
) {
  if (
    !container ||
    track.kind !== Track.Kind.Video ||
    publication.source !== Track.Source.ScreenShare
  ) {
    return
  }

  const key = attachmentKey(participant.identity, publication.trackSid)
  if (attachments.has(key)) {
    return
  }

  const mediaElement = track.attach()
  mediaElement.autoplay = true
  mediaElement.dataset.opencordRemoteScreenShare = participant.identity
  if (mediaElement instanceof HTMLVideoElement) {
    mediaElement.playsInline = true
    mediaElement.muted = true
  }

  const rootElement = document.createElement('article')
  rootElement.className = 'remote-screen-share'
  rootElement.dataset.opencordRemoteScreenShareCard = participant.identity
  rootElement.setAttribute('aria-label', `Screen share from ${participant.identity}`)

  const label = document.createElement('span')
  label.textContent = `Screen share: ${participant.identity}`
  rootElement.append(mediaElement, label)
  container.append(rootElement)

  attachments.set(key, {
    participantIdentity: participant.identity,
    trackSid: publication.trackSid,
    mediaElement,
    rootElement,
    track,
  })
}

function detachRemoteMedia(attachments: Map<string, MediaAttachment>, key: string) {
  const attachment = attachments.get(key)
  if (!attachment) {
    return
  }

  attachment.track.detach(attachment.mediaElement)
  attachment.rootElement.remove()
  attachments.delete(key)
}

function detachRemoteMediaForParticipant(
  attachments: Map<string, MediaAttachment>,
  participantIdentity: string,
) {
  for (const [key, attachment] of attachments) {
    if (attachment.participantIdentity === participantIdentity) {
      detachRemoteMedia(attachments, key)
    }
  }
}

function detachAllRemoteMedia(attachments: Map<string, MediaAttachment>) {
  for (const key of attachments.keys()) {
    detachRemoteMedia(attachments, key)
  }
}

function attachmentKey(participantIdentity: string, trackSid: string) {
  return `${participantIdentity}:${trackSid}`
}

async function stopPublishedScreenShare(
  room: Room,
  tracks: LocalVideoTrack[],
  clearTracks: () => void,
) {
  if (tracks.length === 0) {
    return
  }

  const tracksToStop = [...tracks]
  clearTracks()
  await Promise.allSettled(
    tracksToStop.map((track) => room.localParticipant.unpublishTrack(track, true)),
  )
  tracksToStop.forEach((track) => {
    if (track.mediaStreamTrack.readyState !== 'ended') {
      track.stop()
    }
  })
}

async function waitForLocalScreenSharePublication(room: Room, expectedTracks: number) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (localScreenSharePublications(room).length >= expectedTracks) {
      return
    }
    await delay(100)
  }

  throw new Error('Screen share was not published by LiveKit')
}

function localScreenSharePublications(room: Room) {
  return Array.from(room.localParticipant.videoTrackPublications.values()).filter(
    isScreenSharePublication,
  )
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function isScreenSharePublication(publication: LocalTrackPublication | RemoteTrackPublication) {
  return publication.source === Track.Source.ScreenShare
}

function registerDiagnosticsSession(session: LiveKitVoiceSession) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const diagnostics = (window.__opencordMediaDiagnostics__ ??= { voiceSessions: [] })
  const diagnosticsSession: LiveKitVoiceDiagnosticsSession = {
    roomName: session.roomName,
    participantIdentity: session.participantIdentity,
    snapshot: session.snapshot,
  }
  diagnostics.voiceSessions.push(diagnosticsSession)

  return () => {
    diagnostics.voiceSessions = diagnostics.voiceSessions.filter(
      (candidate) => candidate !== diagnosticsSession,
    )
  }
}
