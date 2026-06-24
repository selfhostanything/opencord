import { describe, expect, it, vi } from 'vitest'

import { nativeLiveKitServerUrlForPlatform } from './nativeMediaUrls'
import {
  registerNativeMediaRefreshListeners,
  startNativeMediaStatePoll,
} from './nativeRoomListeners'
import {
  nativeScreenShareStreamFromSubscription,
  nativeScreenSharePublicationHasRenderableTrack,
  nativeScreenSharePublicationKey,
  nativeScreenSharePublicationNeedsResubscribe,
  resubscribeMissingNativeScreenShares,
  nativeScreenShareStreamsFromParticipants,
  nativeScreenShareStreamsFromPublications,
} from './nativeScreenShareStreams'

describe('native media runtime helpers', () => {
  it('maps host loopback LiveKit URLs to the Android emulator host gateway', () => {
    expect(nativeLiveKitServerUrlForPlatform('ws://localhost:7880', 'android')).toBe(
      'ws://10.0.2.2:7880',
    )
    expect(nativeLiveKitServerUrlForPlatform('ws://127.0.0.1:7880', 'android')).toBe(
      'ws://10.0.2.2:7880',
    )
  })

  it('maps host loopback LiveKit URLs to the iOS simulator host loopback address', () => {
    expect(nativeLiveKitServerUrlForPlatform('ws://localhost:7880', 'ios')).toBe(
      'ws://127.0.0.1:7880',
    )
    expect(nativeLiveKitServerUrlForPlatform('ws://[::1]:7880', 'ios')).toBe(
      'ws://127.0.0.1:7880',
    )
  })

  it('leaves non-local LiveKit URLs unchanged', () => {
    expect(nativeLiveKitServerUrlForPlatform('wss://media.opencord.example', 'ios')).toBe(
      'wss://media.opencord.example',
    )
    expect(nativeLiveKitServerUrlForPlatform('wss://media.opencord.example', 'android')).toBe(
      'wss://media.opencord.example',
    )
  })

  it('extracts renderable remote screen-share stream URLs from LiveKit publications', () => {
    const streams = nativeScreenShareStreamsFromPublications([
      {
        participantIdentity: 'browser-owner',
        publications: [
          {
            trackSid: 'TR_SCREEN_1',
            source: 'screen_share',
            track: {
              mediaStream: {
                toURL: () => 'react-tag-screen-1',
              },
            },
          },
          {
            trackSid: 'TR_CAMERA_1',
            source: 'camera',
            track: {
              mediaStream: {
                toURL: () => 'react-tag-camera-1',
              },
            },
          },
        ],
      },
    ])

    expect(streams).toEqual([
      {
        id: 'TR_SCREEN_1',
        participantIdentity: 'browser-owner',
        streamUrl: 'react-tag-screen-1',
      },
    ])
  })

  it('counts React Native LiveKit screen shares exposed only as video track publications', () => {
    const room = {
      localParticipant: {
        audioTrackPublications: [],
      },
      remoteParticipants: new Map([
        [
          'browser-owner',
          {
            identity: 'browser-owner',
            audioTrackPublications: [],
            trackPublications: [],
            videoTrackPublications: new Map([
              [
                'TR_SCREEN_VIDEO',
                {
                  trackSid: 'TR_SCREEN_VIDEO',
                  source: 'screen_share',
                  track: {
                    mediaStream: {
                      toURL: () => 'react-tag-screen-video',
                    },
                  },
                },
              ],
            ]),
          },
        ],
      ]),
    }

    expect(nativeScreenShareStreamsFromParticipants(room.remoteParticipants)).toEqual([
      {
        id: 'TR_SCREEN_VIDEO',
        participantIdentity: 'browser-owner',
        streamUrl: 'react-tag-screen-video',
      },
    ])
  })

  it('extracts React Native screen-share streams from the LiveKit videoTrack getter', () => {
    const streams = nativeScreenShareStreamsFromPublications([
      {
        participantIdentity: 'browser-owner',
        publications: [
          {
            trackSid: 'TR_SCREEN_GETTER',
            source: 'screen_share',
            videoTrack: {
              mediaStream: {
                toURL: () => 'react-tag-video-getter',
              },
            },
          },
        ],
      },
    ])

    expect(streams).toEqual([
      {
        id: 'TR_SCREEN_GETTER',
        participantIdentity: 'browser-owner',
        streamUrl: 'react-tag-video-getter',
      },
    ])
  })

  it('normalizes LiveKit screen-share source variants from native publications', () => {
    const streams = nativeScreenShareStreamsFromPublications([
      {
        participantIdentity: 'browser-owner',
        publications: [
          {
            trackSid: 'TR_SCREEN_UPPER',
            source: 'SCREEN_SHARE',
            track: {
              mediaStream: {
                toURL: () => 'react-tag-screen-upper',
              },
            },
          },
        ],
      },
    ])

    expect(streams).toEqual([
      {
        id: 'TR_SCREEN_UPPER',
        participantIdentity: 'browser-owner',
        streamUrl: 'react-tag-screen-upper',
      },
    ])
  })

  it('recognizes browser screen-share video publications while source metadata is delayed', () => {
    const streams = nativeScreenShareStreamsFromPublications([
      {
        participantIdentity: 'browser-owner',
        publications: [
          {
            kind: 'video',
            trackName: 'screen',
            trackSid: 'TR_SCREEN_BY_NAME',
            track: {
              kind: 'video',
              mediaStream: {
                toURL: () => 'react-tag-screen-by-name',
              },
            },
          },
        ],
      },
    ])

    expect(streams).toEqual([
      {
        id: 'TR_SCREEN_BY_NAME',
        participantIdentity: 'browser-owner',
        streamUrl: 'react-tag-screen-by-name',
      },
    ])
  })

  it('extracts React Native screen shares exposed through participant getTrackPublication', () => {
    const screenSharePublication = {
      trackSid: 'TR_SCREEN_LOOKUP',
      source: 'screen_share',
      track: {
        mediaStream: {
          toURL: () => 'react-tag-screen-lookup',
        },
      },
    }

    expect(
      nativeScreenShareStreamsFromParticipants([
        {
          identity: 'browser-owner',
          audioTrackPublications: [],
          trackPublications: [],
          videoTrackPublications: [],
          getTrackPublication: (source: string) =>
            source === 'screen_share' ? screenSharePublication : undefined,
        },
      ]),
    ).toEqual([
      {
        id: 'TR_SCREEN_LOOKUP',
        participantIdentity: 'browser-owner',
        streamUrl: 'react-tag-screen-lookup',
      },
    ])
  })

  it('extracts a screen-share stream from a LiveKit TrackSubscribed event payload', () => {
    const stream = nativeScreenShareStreamFromSubscription({
      participant: { identity: 'browser-owner' },
      publication: {
        source: 'screen_share',
        trackSid: 'TR_SCREEN_EVENT',
      },
      track: {
        mediaStream: {
          toURL: () => 'react-tag-screen-event',
        },
      },
    })

    expect(stream).toEqual({
      id: 'TR_SCREEN_EVENT',
      participantIdentity: 'browser-owner',
      streamUrl: 'react-tag-screen-event',
    })
  })

  it('identifies screen-share publications that arrived before their native track', () => {
    expect(
      nativeScreenSharePublicationNeedsResubscribe({
        source: 'screen_share',
        trackSid: 'TR_SCREEN_DELAYED',
      }),
    ).toBe(true)
    expect(
      nativeScreenSharePublicationNeedsResubscribe({
        source: 'screen_share',
        trackSid: 'TR_SCREEN_READY',
        track: {
          mediaStream: {
            toURL: () => 'react-tag-screen-ready',
          },
        },
      }),
    ).toBe(false)
    expect(
      nativeScreenSharePublicationHasRenderableTrack({
        source: 'screen_share',
        videoTrack: {
          mediaStream: {
            toURL: () => 'react-tag-screen-video-ready',
          },
        },
      }),
    ).toBe(true)
  })

  it('builds stable resubscribe keys for delayed screen-share publications', () => {
    expect(
      nativeScreenSharePublicationKey(
        'browser-owner',
        {
          source: 'screen_share',
          trackSid: 'TR_SCREEN_DELAYED',
        },
        0,
      ),
    ).toBe('browser-owner:TR_SCREEN_DELAYED')
  })
})

describe('native media screen-share resubscribe recovery', () => {
  it('toggles a delayed screen-share publication subscription once metadata exists', () => {
    vi.useFakeTimers()
    const setSubscribed = vi.fn()
    const attempts = new Map<string, number>()

    const queued = resubscribeMissingNativeScreenShares(
      {
        remoteParticipants: new Map([
          [
            'browser-owner',
            {
              identity: 'browser-owner',
              trackPublications: new Map([
                [
                  'TR_SCREEN_DELAYED',
                  {
                    source: 'screen_share',
                    trackSid: 'TR_SCREEN_DELAYED',
                    setSubscribed,
                  },
                ],
              ]),
            },
          ],
        ]),
      },
      attempts,
      { delayMs: 250 },
    )

    expect(queued).toEqual(['browser-owner:TR_SCREEN_DELAYED'])
    expect(setSubscribed).toHaveBeenCalledWith(false)
    expect(setSubscribed).not.toHaveBeenCalledWith(true)

    vi.advanceTimersByTime(250)

    expect(setSubscribed).toHaveBeenCalledWith(true)
    expect(attempts.get('browser-owner:TR_SCREEN_DELAYED')).toBe(1)
    vi.useRealTimers()
  })

  it('does not resubscribe already renderable or repeatedly failed screen-share publications', () => {
    const readySetSubscribed = vi.fn()
    const delayedSetSubscribed = vi.fn()
    const attempts = new Map<string, number>([['browser-owner:TR_SCREEN_DELAYED', 3]])

    const queued = resubscribeMissingNativeScreenShares(
      {
        remoteParticipants: [
          {
            identity: 'browser-owner',
            trackPublications: [
              {
                source: 'screen_share',
                trackSid: 'TR_SCREEN_READY',
                setSubscribed: readySetSubscribed,
                track: {
                  mediaStream: {
                    toURL: () => 'react-tag-screen-ready',
                  },
                },
              },
              {
                source: 'screen_share',
                trackSid: 'TR_SCREEN_DELAYED',
                setSubscribed: delayedSetSubscribed,
              },
            ],
          },
        ],
      },
      attempts,
    )

    expect(queued).toEqual([])
    expect(readySetSubscribed).not.toHaveBeenCalled()
    expect(delayedSetSubscribed).not.toHaveBeenCalled()
  })
})

describe('native media room refresh listeners', () => {
  it('refreshes when an existing remote participant subscribes a track', () => {
    const participant = new FakeEventTarget()
    const room = new FakeEventTarget({
      remoteParticipants: new Map([['browser-owner', participant]]),
    })
    const listener = vi.fn()

    const cleanup = registerNativeMediaRefreshListeners(room, listener)
    participant.emit('trackSubscribed')

    expect(listener).toHaveBeenCalled()
    cleanup()
  })

  it('refreshes for participants that appear after the room connects', () => {
    const participant = new FakeEventTarget()
    const room = new FakeEventTarget({
      remoteParticipants: new Map(),
    })
    const listener = vi.fn()

    const cleanup = registerNativeMediaRefreshListeners(room, listener)
    room.remoteParticipants!.set('browser-owner', participant)
    room.emit('participantConnected')
    participant.emit('trackSubscribed')

    expect(listener).toHaveBeenCalled()
    cleanup()
  })

  it('stops participant refresh listeners during cleanup', () => {
    const participant = new FakeEventTarget()
    const room = new FakeEventTarget({
      remoteParticipants: new Map([['browser-owner', participant]]),
    })
    const listener = vi.fn()

    const cleanup = registerNativeMediaRefreshListeners(room, listener)
    cleanup()
    participant.emit('trackSubscribed')

    expect(listener).not.toHaveBeenCalled()
  })

  it('polls active native media state and can be stopped', () => {
    vi.useFakeTimers()
    const listener = vi.fn()

    const stop = startNativeMediaStatePoll(listener, 1_000)
    vi.advanceTimersByTime(2_000)
    stop()
    vi.advanceTimersByTime(1_000)

    expect(listener).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})

class FakeEventTarget {
  remoteParticipants?: Map<string, FakeEventTarget>

  private readonly listeners = new Map<string, Set<() => void>>()

  constructor(options: { remoteParticipants?: Map<string, FakeEventTarget> } = {}) {
    this.remoteParticipants = options.remoteParticipants
  }

  on(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) ?? new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return this
  }

  off(event: string, listener: () => void) {
    this.listeners.get(event)?.delete(listener)
    return this
  }

  emit(event: string) {
    this.listeners.get(event)?.forEach((listener) => listener())
  }
}
