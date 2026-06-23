import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_OPENCORD_SERVER_URL,
  OpenCordApiError,
  createOpenCordApiClient,
  normalizeOpenCordBaseUrl,
} from './index'

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init?.status ?? 200,
    statusText: init?.statusText,
  })
}

describe('OpenCord API client', () => {
  it('normalizes base URLs for any compatible OpenCord server', () => {
    expect(normalizeOpenCordBaseUrl()).toBe(DEFAULT_OPENCORD_SERVER_URL)
    expect(normalizeOpenCordBaseUrl(' https://chat.example.com/// ')).toBe(
      'https://chat.example.com',
    )
    expect(normalizeOpenCordBaseUrl('http://localhost:8080/api')).toBe(
      'http://localhost:8080/api',
    )
    expect(() => normalizeOpenCordBaseUrl('   ')).toThrow('OpenCord server URL is required')
  })

  it('checks health with normalized URLs and JSON accept headers', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', version: 'test-version' }))
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com///',
      fetch: fetchMock,
    })

    await expect(client.health()).resolves.toEqual({ status: 'online', version: 'test-version' })
    expect(fetchMock).toHaveBeenCalledWith('https://chat.example.com/healthz', {
      headers: { Accept: 'application/json' },
    })
  })

  it('maps health failures into offline states for UI connection badges', async () => {
    const httpFailure = createOpenCordApiClient({
      fetch: vi.fn().mockResolvedValue(jsonResponse({ error: 'down' }, { status: 503 })),
    })
    await expect(httpFailure.health()).resolves.toEqual({ status: 'offline', message: 'HTTP 503' })

    const invalidPayload = createOpenCordApiClient({
      fetch: vi.fn().mockResolvedValue(jsonResponse({ status: 'maintenance' })),
    })
    await expect(invalidPayload.health()).resolves.toEqual({
      status: 'offline',
      message: 'Health response was not ok',
    })

    const networkFailure = createOpenCordApiClient({
      fetch: vi.fn().mockRejectedValue(new Error('connection refused')),
    })
    await expect(networkFailure.health()).resolves.toEqual({
      status: 'offline',
      message: 'connection refused',
    })
  })

  it('discovers server metadata with typed version and capabilities calls', async () => {
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        jsonResponse({
          server: 'opencord',
          version: '0.1.0',
          api_base_url: 'https://chat.example.com/api',
          realtime_url: 'wss://chat.example.com/ws',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ version: '0.1.0' }))
      .mockResolvedValueOnce(jsonResponse({ capabilities: ['uuidv7', 'messages', 'audit'] }))
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
    })

    await expect(client.discover()).resolves.toEqual({
      wellKnown: {
        server: 'opencord',
        version: '0.1.0',
        apiBaseUrl: 'https://chat.example.com/api',
        realtimeUrl: 'wss://chat.example.com/ws',
      },
      version: '0.1.0',
      capabilities: ['uuidv7', 'messages', 'audit'],
    })
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://chat.example.com/.well-known/opencord', {
      headers: { Accept: 'application/json' },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://chat.example.com/api/version', {
      headers: { Accept: 'application/json' },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'https://chat.example.com/api/capabilities', {
      headers: { Accept: 'application/json' },
    })
  })

  it('throws typed API errors for non-health JSON endpoints', async () => {
    const client = createOpenCordApiClient({
      fetch: vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: { message: 'missing' } }, { status: 404 })),
    })

    const error = await client.version().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(OpenCordApiError)
    expect(error).toMatchObject({ status: 404 })
    expect(error).toHaveProperty('message', 'missing')
  })

  it('registers push tokens with bearer auth and maps masked responses', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        push_token: {
          id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
          user_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
          platform: 'ios',
          token_last_four: '456]',
          device_name: 'Ada iPhone',
          created_at: '2026-06-23T02:00:00.000Z',
          updated_at: '2026-06-23T02:00:00.000Z',
        },
      }),
    )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(
      client.registerPushToken({
        platform: 'ios',
        token: 'ExponentPushToken[abcdefghijklmnopqrstuvwxyz123456]',
        deviceName: 'Ada iPhone',
      }),
    ).resolves.toEqual({
      id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
      userId: '01973f83-f22a-73ba-ae76-5a045c52fc97',
      platform: 'ios',
      tokenLastFour: '456]',
      deviceName: 'Ada iPhone',
      createdAt: '2026-06-23T02:00:00.000Z',
      updatedAt: '2026-06-23T02:00:00.000Z',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://chat.example.com/push-tokens', {
      body: JSON.stringify({
        platform: 'ios',
        token: 'ExponentPushToken[abcdefghijklmnopqrstuvwxyz123456]',
        device_name: 'Ada iPhone',
      }),
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer session-token',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  })

  it('lists current user push tokens through the typed API', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        push_tokens: [
          {
            id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
            user_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
            platform: 'android',
            token_last_four: '7890',
            device_name: null,
            created_at: '2026-06-23T02:00:00.000Z',
            updated_at: '2026-06-23T02:00:00.000Z',
          },
        ],
      }),
    )
    const client = createOpenCordApiClient({
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(client.listPushTokens()).resolves.toEqual([
      {
        id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
        userId: '01973f83-f22a-73ba-ae76-5a045c52fc97',
        platform: 'android',
        tokenLastFour: '7890',
        deviceName: null,
        createdAt: '2026-06-23T02:00:00.000Z',
        updatedAt: '2026-06-23T02:00:00.000Z',
      },
    ])
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/push-tokens', {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer session-token',
      },
    })
  })

  it('joins a voice channel with bearer auth and maps media join config', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        voice: {
          channel_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
          user_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
          self_mute: false,
          self_deaf: false,
        },
        media: {
          provider: 'livekit',
          server_url: 'ws://localhost:7880',
          region: 'local',
          room_type: 'voice_channel',
          room_name: 'opencord_voice_01973f83f22a73baae765a045c52fc98',
          organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
          space_id: '01973f83-f22a-73ba-ae76-5a045c52fc95',
          channel_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
          participant_identity: '01973f83-f22a-73ba-ae76-5a045c52fc97',
          participant_token: 'livekit.jwt',
          expires_at: '2026-06-23T03:30:00.000Z',
          grants: {
            can_publish_audio: true,
            can_publish_video: false,
            can_publish_screen: false,
            can_subscribe: true,
          },
        },
      }),
    )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(
      client.joinVoiceChannel('01973f83-f22a-73ba-ae76-5a045c52fc98', {
        selfMute: false,
        selfDeaf: false,
      }),
    ).resolves.toEqual({
      voice: {
        channelId: '01973f83-f22a-73ba-ae76-5a045c52fc98',
        userId: '01973f83-f22a-73ba-ae76-5a045c52fc97',
        selfMute: false,
        selfDeaf: false,
      },
      media: {
        provider: 'livekit',
        serverUrl: 'ws://localhost:7880',
        region: 'local',
        roomType: 'voice_channel',
        roomName: 'opencord_voice_01973f83f22a73baae765a045c52fc98',
        organizationId: '01973f83-f22a-73ba-ae76-5a045c52fc96',
        spaceId: '01973f83-f22a-73ba-ae76-5a045c52fc95',
        channelId: '01973f83-f22a-73ba-ae76-5a045c52fc98',
        participantIdentity: '01973f83-f22a-73ba-ae76-5a045c52fc97',
        participantToken: 'livekit.jwt',
        expiresAt: '2026-06-23T03:30:00.000Z',
        grants: {
          canPublishAudio: true,
          canPublishVideo: false,
          canPublishScreen: false,
          canSubscribe: true,
        },
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/voice/channels/01973f83-f22a-73ba-ae76-5a045c52fc98/join',
      {
        body: JSON.stringify({
          self_mute: false,
          self_deaf: false,
        }),
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    )
  })

  it('resolves meeting join URLs through the typed API', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        meeting: {
          id: '01973f83-f22a-73ba-ae76-5a045c52fca1',
          organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
          space_id: null,
          channel_id: null,
          created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
          title: 'Roadmap Review',
          description: 'Launch scope',
          status: 'scheduled',
          starts_at: '2026-06-24T09:00:00Z',
          ends_at: '2026-06-24T09:30:00Z',
          timezone: 'Asia/Bangkok',
          join_slug: 'mtg-01973f83f22a73baae765a045c52fca1',
          join_url: 'https://chat.example.com/join/mtg-01973f83f22a73baae765a045c52fca1',
          cancelled_at: null,
          attendees: [
            {
              id: '01973f83-f22a-73ba-ae76-5a045c52fca2',
              meeting_id: '01973f83-f22a-73ba-ae76-5a045c52fca1',
              user_id: null,
              email: 'external@example.com',
              display_name: 'External Guest',
              role: 'required',
              response_status: 'needs_action',
            },
          ],
          reminders: [
            {
              id: '01973f83-f22a-73ba-ae76-5a045c52fca3',
              meeting_id: '01973f83-f22a-73ba-ae76-5a045c52fca1',
              recipient_user_id: null,
              recipient_email: 'external@example.com',
              channel: 'email',
              offset_minutes: 10,
              scheduled_for: '2026-06-24T08:50:00Z',
              status: 'pending',
            },
          ],
        },
      }),
    )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(
      client.resolveMeetingJoinUrl('mtg-01973f83f22a73baae765a045c52fca1'),
    ).resolves.toEqual({
      id: '01973f83-f22a-73ba-ae76-5a045c52fca1',
      organizationId: '01973f83-f22a-73ba-ae76-5a045c52fc96',
      spaceId: null,
      channelId: null,
      createdByUserId: '01973f83-f22a-73ba-ae76-5a045c52fc97',
      title: 'Roadmap Review',
      description: 'Launch scope',
      status: 'scheduled',
      startsAt: '2026-06-24T09:00:00Z',
      endsAt: '2026-06-24T09:30:00Z',
      timezone: 'Asia/Bangkok',
      joinSlug: 'mtg-01973f83f22a73baae765a045c52fca1',
      joinUrl: 'https://chat.example.com/join/mtg-01973f83f22a73baae765a045c52fca1',
      cancelledAt: null,
      attendees: [
        {
          id: '01973f83-f22a-73ba-ae76-5a045c52fca2',
          meetingId: '01973f83-f22a-73ba-ae76-5a045c52fca1',
          userId: null,
          email: 'external@example.com',
          displayName: 'External Guest',
          role: 'required',
          responseStatus: 'needs_action',
        },
      ],
      reminders: [
        {
          id: '01973f83-f22a-73ba-ae76-5a045c52fca3',
          meetingId: '01973f83-f22a-73ba-ae76-5a045c52fca1',
          recipientUserId: null,
          recipientEmail: 'external@example.com',
          channel: 'email',
          offsetMinutes: 10,
          scheduledFor: '2026-06-24T08:50:00Z',
          status: 'pending',
        },
      ],
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/join/mtg-01973f83f22a73baae765a045c52fca1',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
        },
      },
    )
  })
})
