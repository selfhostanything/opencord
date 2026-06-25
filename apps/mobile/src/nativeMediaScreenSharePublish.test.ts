import { beforeEach, describe, expect, it, vi } from 'vitest'

import { connectNativeLiveKitVoice } from './nativeMedia'

const testState = vi.hoisted(() => ({
  audioSession: {
    startAudioSession: vi.fn(async () => {}),
    stopAudioSession: vi.fn(async () => {}),
  },
  lastRoom: null as FakeRoom | null,
}))

vi.mock('@livekit/react-native', () => ({
  AudioSession: testState.audioSession,
  registerGlobals: vi.fn(),
}))

vi.mock('react-native', () => ({
  NativeModules: {
    ScreenCapturePickerViewManager: {
      show: vi.fn(async () => {}),
    },
  },
  Platform: { OS: 'android', Version: 35 },
}))

vi.mock('livekit-client', () => ({
  Room: class {
    constructor() {
      testState.lastRoom = new FakeRoom()
      return testState.lastRoom
    }
  },
  RoomEvent: {
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    LocalTrackPublished: 'localTrackPublished',
    LocalTrackUnpublished: 'localTrackUnpublished',
  },
}))

vi.mock('./nativeCallIntegration', () => ({
  createNativeCallIntegrationSession: vi.fn(async () => ({
    end: vi.fn(async () => {}),
    setMuted: vi.fn(async () => {}),
  })),
}))

vi.mock('./nativeRoomListeners', () => ({
  registerNativeMediaRefreshListeners: vi.fn(() => () => {}),
  startNativeMediaStatePoll: vi.fn(() => () => {}),
}))

describe('native LiveKit mobile screen-share publish', () => {
  beforeEach(() => {
    testState.lastRoom = null
    testState.audioSession.startAudioSession.mockClear()
    testState.audioSession.stopAudioSession.mockClear()
  })

  it('publishes and stops mobile screen share through the active LiveKit session', async () => {
    const session = await connectNativeLiveKitVoice({
      media: mediaTokenFixture({ canPublishScreen: true }),
      selfDeaf: false,
      selfMute: false,
    })

    await session.publishScreenShare()
    expect(testState.lastRoom?.localParticipant.setScreenShareEnabled)
      .toHaveBeenLastCalledWith(true)
    expect(session.snapshot().localScreenShareTracks).toBe(1)

    await session.stopScreenShare()
    expect(testState.lastRoom?.localParticipant.setScreenShareEnabled)
      .toHaveBeenLastCalledWith(false)
    expect(session.snapshot().localScreenShareTracks).toBe(0)
  })

  it('rejects mobile screen-share publish when the media grant does not allow it', async () => {
    const session = await connectNativeLiveKitVoice({
      media: mediaTokenFixture({ canPublishScreen: false }),
      selfDeaf: false,
      selfMute: false,
    })

    await expect(session.publishScreenShare()).rejects.toThrow(
      'Screen share is not allowed for this room',
    )
    expect(testState.lastRoom?.localParticipant.setScreenShareEnabled)
      .not.toHaveBeenCalledWith(true)
  })

  it('normalizes native screen-share start failures into actionable errors', async () => {
    const session = await connectNativeLiveKitVoice({
      media: mediaTokenFixture({ canPublishScreen: true }),
      selfDeaf: false,
      selfMute: false,
    })
    testState.lastRoom?.localParticipant.setScreenShareEnabled.mockRejectedValueOnce(undefined)

    await expect(session.publishScreenShare()).rejects.toThrow(
      'Native screen sharing could not start.',
    )
    expect(session.snapshot().localScreenShareTracks).toBe(0)
  })

  it('stops an active mobile screen share during disconnect cleanup', async () => {
    const session = await connectNativeLiveKitVoice({
      media: mediaTokenFixture({ canPublishScreen: true }),
      selfDeaf: false,
      selfMute: false,
    })

    await session.publishScreenShare()
    await session.disconnect()

    expect(testState.lastRoom?.localParticipant.setScreenShareEnabled)
      .toHaveBeenLastCalledWith(false)
    expect(testState.audioSession.stopAudioSession).toHaveBeenCalled()
  })
})

class FakeRoom {
  state = 'disconnected'

  localParticipant = {
    audioTrackPublications: [],
    videoTrackPublications: new Map<string, unknown>(),
    setMicrophoneEnabled: vi.fn(async () => {}),
    setScreenShareEnabled: vi.fn(async (enabled: boolean) => {
      if (enabled) {
        this.localParticipant.videoTrackPublications.set('screen', {
          isMuted: false,
          kind: 'video',
          source: 'screen_share',
          trackSid: 'TR_LOCAL_SCREEN',
        })
      } else {
        this.localParticipant.videoTrackPublications.clear()
      }
    }),
  }

  remoteParticipants = new Map<string, unknown>()

  connect = vi.fn(async () => {
    this.state = 'connected'
  })

  disconnect = vi.fn(() => {
    this.state = 'disconnected'
  })

  on = vi.fn(() => this)
}

function mediaTokenFixture(options: { canPublishScreen: boolean }) {
  return {
    grants: {
      canPublishAudio: true,
      canPublishScreen: options.canPublishScreen,
      canSubscribe: true,
    },
    participantIdentity: 'mobile-user',
    participantToken: 'redacted-test-token',
    roomName: 'opencord_voice_test',
    roomType: 'voice_channel',
    serverUrl: 'ws://localhost:7880',
  } as never
}
