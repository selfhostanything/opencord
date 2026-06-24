// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const liveKitMocks = vi.hoisted(() => {
  const rooms: MockRoom[] = []

  const RoomEvent = {
    Connected: 'connected',
    Disconnected: 'disconnected',
    LocalTrackPublished: 'localTrackPublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
  } as const

  const Track = {
    Kind: {
      Audio: 'audio',
      Video: 'video',
    },
    Source: {
      Microphone: 'microphone',
      ScreenShare: 'screen_share',
    },
  } as const

  type MockHandler = (...args: unknown[]) => void

  class MockLocalVideoTrack {
    kind = Track.Kind.Video
    source = Track.Source.ScreenShare
    stop = vi.fn()

    constructor(
      public mediaStreamTrack: MediaStreamTrack,
      _constraints?: unknown,
      _userProvided?: boolean,
    ) {}
  }

  class MockLocalParticipant {
    audioTrackPublications = new Map<string, MockTrackPublication>()
    videoTrackPublications = new Map<string, MockTrackPublication>()
    microphoneEnabledCalls: boolean[] = []
    publishedTracks: MockLocalVideoTrack[] = []
    unpublishedTracks: MockLocalVideoTrack[] = []

    constructor(private readonly room: MockRoom) {}

    async setMicrophoneEnabled(enabled: boolean) {
      this.microphoneEnabledCalls.push(enabled)
      this.audioTrackPublications.set(
        'local-microphone',
        createPublication('local-microphone', Track.Kind.Audio, Track.Source.Microphone, !enabled),
      )
    }

    async publishTrack(track: MockLocalVideoTrack, _options: { name: string }) {
      this.publishedTracks.push(track)
      this.videoTrackPublications.set(
        `local-screen-${this.publishedTracks.length}`,
        createPublication(
          `local-screen-${this.publishedTracks.length}`,
          Track.Kind.Video,
          Track.Source.ScreenShare,
        ),
      )
      this.room.emit(RoomEvent.LocalTrackPublished)
    }

    async unpublishTrack(track: MockLocalVideoTrack, _stopOnUnpublish: boolean) {
      this.unpublishedTracks.push(track)
      this.videoTrackPublications.clear()
      this.room.emit(RoomEvent.LocalTrackUnpublished)
    }
  }

  class MockRoom {
    state: 'connected' | 'disconnected' = 'disconnected'
    localParticipant = new MockLocalParticipant(this)
    remoteParticipants = new Map<string, MockRemoteParticipant>()
    connectCall:
      | {
          serverUrl: string
          participantToken: string
          options: { autoSubscribe: boolean; rtcConfig?: RTCConfiguration }
        }
      | null = null
    disconnectCalls = 0
    private readonly handlers = new Map<string, MockHandler[]>()

    constructor(public readonly options: { adaptiveStream: boolean; dynacast: boolean }) {
      rooms.push(this)
    }

    on(event: string, handler: MockHandler) {
      const handlers = this.handlers.get(event) ?? []
      handlers.push(handler)
      this.handlers.set(event, handlers)
      return this
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args)
      }
    }

    async connect(
      serverUrl: string,
      participantToken: string,
      options: { autoSubscribe: boolean; rtcConfig?: RTCConfiguration },
    ) {
      this.connectCall = { serverUrl, participantToken, options }
      this.state = 'connected'
      this.emit(RoomEvent.Connected)
    }

    async disconnect() {
      this.disconnectCalls += 1
      this.state = 'disconnected'
      this.emit(RoomEvent.Disconnected)
    }
  }

  type MockTrackPublication = {
    trackSid: string
    kind: string
    source: string
    isMuted: boolean
  }

  type MockRemoteParticipant = {
    identity: string
    audioTrackPublications: Map<string, MockTrackPublication>
    videoTrackPublications: Map<string, MockTrackPublication>
  }

  function createPublication(
    trackSid: string,
    kind: string,
    source: string,
    isMuted = false,
  ): MockTrackPublication {
    return { trackSid, kind, source, isMuted }
  }

  function createRemoteParticipant(identity: string): MockRemoteParticipant {
    return {
      identity,
      audioTrackPublications: new Map(),
      videoTrackPublications: new Map(),
    }
  }

  return {
    LocalVideoTrack: MockLocalVideoTrack,
    Room: MockRoom,
    RoomEvent,
    Track,
    createPublication,
    createRemoteParticipant,
    rooms,
  }
})

vi.mock('livekit-client', () => liveKitMocks)

import { connectLiveKitVoice } from './index'
import type { ConnectLiveKitVoiceOptions } from './index'

describe('LiveKit media package', () => {
  beforeEach(() => {
    liveKitMocks.rooms.length = 0
    delete window.__opencordMediaDiagnostics__
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete window.__opencordMediaDiagnostics__
  })

  it('connects with deterministic room options and unregisters diagnostics on leave', async () => {
    const states: string[] = []
    const rtcConfig: RTCConfiguration = { iceTransportPolicy: 'relay' }

    const session = await connectLiveKitVoice(
      baseOptions({
        rtcConfig,
        onStateChange: (state) => states.push(state.status),
      }),
    )

    const room = liveKitMocks.rooms[0]
    expect(room.options).toEqual({ adaptiveStream: false, dynacast: false })
    expect(room.connectCall).toEqual({
      serverUrl: 'ws://livekit.local',
      participantToken: 'participant-token',
      options: { autoSubscribe: true, rtcConfig },
    })
    expect(room.localParticipant.microphoneEnabledCalls).toEqual([true])
    expect(states).toContain('connecting')
    expect(states).toContain('connected')
    expect(window.__opencordMediaDiagnostics__?.voiceSessions).toHaveLength(1)

    await session.disconnect()

    expect(room.disconnectCalls).toBe(1)
    expect(window.__opencordMediaDiagnostics__?.voiceSessions).toHaveLength(0)
  })

  it('keeps microphone publishing in sync with mute and deafen controls', async () => {
    const session = await connectLiveKitVoice(baseOptions())
    const room = liveKitMocks.rooms[0]

    await session.setMuted(true)
    await session.setDeafened(true)
    await session.setMuted(false)
    await session.setDeafened(false)

    expect(room.localParticipant.microphoneEnabledCalls).toEqual([
      true,
      false,
      false,
      false,
      true,
    ])
    expect(session.snapshot().localAudioPublications).toEqual([
      {
        sid: 'local-microphone',
        kind: liveKitMocks.Track.Kind.Audio,
        source: liveKitMocks.Track.Source.Microphone,
        muted: false,
      },
    ])
  })

  it('enforces screen-share grants and stops published screen tracks', async () => {
    const blockedSession = await connectLiveKitVoice(
      baseOptions({ grants: { ...defaultGrants(), canPublishScreen: false } }),
    )
    await expect(blockedSession.publishScreenShare(videoStream())).rejects.toThrow(
      'Screen share is not allowed for this room',
    )

    const session = await connectLiveKitVoice(baseOptions())
    const room = liveKitMocks.rooms[1]
    const stream = videoStream()

    await session.publishScreenShare(stream)

    expect(room.localParticipant.publishedTracks).toHaveLength(1)
    expect(session.snapshot().localScreenSharePublications).toHaveLength(1)

    await session.stopScreenShare()

    expect(room.localParticipant.unpublishedTracks).toEqual(room.localParticipant.publishedTracks)
    expect(room.localParticipant.publishedTracks[0]?.stop).toHaveBeenCalledOnce()
  })

  it('attaches and detaches remote audio and screen-share media', async () => {
    const audioElementContainer = document.createElement('section')
    const screenShareElementContainer = document.createElement('section')
    await connectLiveKitVoice(baseOptions({ audioElementContainer, screenShareElementContainer }))

    const room = liveKitMocks.rooms[0]
    const participant = liveKitMocks.createRemoteParticipant('guest')
    const audioPublication = liveKitMocks.createPublication(
      'remote-audio',
      liveKitMocks.Track.Kind.Audio,
      liveKitMocks.Track.Source.Microphone,
    )
    const screenPublication = liveKitMocks.createPublication(
      'remote-screen',
      liveKitMocks.Track.Kind.Video,
      liveKitMocks.Track.Source.ScreenShare,
    )
    participant.audioTrackPublications.set(audioPublication.trackSid, audioPublication)
    participant.videoTrackPublications.set(screenPublication.trackSid, screenPublication)
    room.remoteParticipants.set(participant.identity, participant)

    const remoteAudio = remoteTrack(liveKitMocks.Track.Kind.Audio, document.createElement('audio'))
    const remoteScreen = remoteTrack(liveKitMocks.Track.Kind.Video, document.createElement('video'))

    room.emit(liveKitMocks.RoomEvent.TrackSubscribed, remoteAudio, audioPublication, participant)
    room.emit(liveKitMocks.RoomEvent.TrackSubscribed, remoteScreen, screenPublication, participant)

    expect(audioElementContainer.querySelector('[data-opencord-remote-audio="guest"]'))
      .toBeInstanceOf(HTMLAudioElement)
    expect(
      screenShareElementContainer.querySelector(
        '[data-opencord-remote-screen-share-card="guest"]',
      )?.textContent,
    ).toContain('Screen share: guest')

    room.emit(liveKitMocks.RoomEvent.ParticipantDisconnected, participant)

    expect(remoteAudio.detach).toHaveBeenCalledOnce()
    expect(remoteScreen.detach).toHaveBeenCalledOnce()
    expect(audioElementContainer.childElementCount).toBe(0)
    expect(screenShareElementContainer.childElementCount).toBe(0)
  })
})

function baseOptions(
  overrides: Partial<ConnectLiveKitVoiceOptions> = {},
): ConnectLiveKitVoiceOptions {
  return {
    serverUrl: 'ws://livekit.local',
    participantToken: 'participant-token',
    roomName: 'voice-room',
    participantIdentity: 'owner',
    grants: defaultGrants(),
    ...overrides,
  }
}

function defaultGrants() {
  return {
    canPublishAudio: true,
    canPublishVideo: false,
    canPublishScreen: true,
    canSubscribe: true,
  }
}

function videoStream() {
  return {
    getVideoTracks: () => [
      {
        addEventListener: vi.fn(),
        readyState: 'live',
      },
    ],
  } as unknown as MediaStream
}

function remoteTrack(kind: string, element: HTMLMediaElement) {
  return {
    kind,
    attach: vi.fn(() => element),
    detach: vi.fn(),
  }
}
