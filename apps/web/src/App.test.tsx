import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryHistory } from '@tanstack/react-router'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { createAppRouter } from './app/router'

const mediaMocks = vi.hoisted(() => ({
  connectLiveKitVoice: vi.fn(),
  lastVoiceSession: null as ReturnType<typeof createMockVoiceSession> | null,
}))

vi.mock('@opencord/media', () => ({
  connectLiveKitVoice: mediaMocks.connectLiveKitVoice,
}))

describe('OpenCord web chat UI', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok', version: 'test-version' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    mediaMocks.connectLiveKitVoice.mockReset()
    mediaMocks.lastVoiceSession = createMockVoiceSession()
    mediaMocks.connectLiveKitVoice.mockResolvedValue(mediaMocks.lastVoiceSession)
  })

  afterEach(() => {
    delete (window as Window & { __OPENCORD_MEDIA_RTC_CONFIG__?: RTCConfiguration })
      .__OPENCORD_MEDIA_RTC_CONFIG__
    window.localStorage?.clear?.()
    vi.unstubAllGlobals()
  })

  it('renders a Discord-like workspace with rail, channels, messages, composer, and members', async () => {
    render(<App />)

    expect(await screen.findByLabelText('Space rail')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Channel navigation' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '# general' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message timeline')).toHaveTextContent('Welcome to OpenCord')
    expect(screen.getByLabelText('Message composer')).toBeInTheDocument()
    expect(screen.getByText('Realtime ready')).toHaveAttribute(
      'data-realtime-url',
      'ws://localhost:8080/ws',
    )
    expect(screen.getByRole('complementary', { name: 'Members' })).toHaveTextContent('Product')

    await waitFor(() => {
      expect(screen.getByText('API online')).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/healthz', {
      headers: { Accept: 'application/json' },
    })
  })

  it('opens quiet Voice & Video settings from the user footer', async () => {
    vi.stubGlobal('openCordDesktop', {
      platform: 'darwin',
      versions: {
        chrome: 'test-chrome',
        electron: 'test-electron',
        node: 'test-node',
      },
    })

    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'User settings' }))

    const voiceVideoSettings = screen.getByRole('region', { name: 'Voice & Video settings' })
    expect(within(voiceVideoSettings).getByRole('heading', { name: 'Voice & Video' }))
      .toBeInTheDocument()
    expect(voiceVideoSettings).toHaveTextContent('macOS desktop')
    expect(voiceVideoSettings).toHaveTextContent('Microphone')
    expect(voiceVideoSettings).toHaveTextContent('Ask before join')
    expect(voiceVideoSettings).toHaveTextContent('Screen share')
    expect(voiceVideoSettings).toHaveTextContent('macOS System Settings')
    expect(voiceVideoSettings).toHaveTextContent('Speaker output')

    await userEvent.click(within(voiceVideoSettings).getByRole('button', { name: 'Close user settings' }))

    expect(screen.queryByRole('region', { name: 'Voice & Video settings' })).not.toBeInTheDocument()
  })

  it('bootstraps a local alpha workspace and sends messages through real API calls', async () => {
    const channelId = '01973f83-f22a-73ba-ae76-5a045c52fc93'
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString()
      if (url.endsWith('/healthz')) {
        return new Response(JSON.stringify({ status: 'ok', version: 'test-version' }))
      }
      if (url.endsWith('/auth/register')) {
        return new Response(
          JSON.stringify({
            user: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc90',
              email: 'alpha@example.com',
              display_name: 'Alpha User',
            },
            session: { token: 'session-token' },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/organizations')) {
        return new Response(
          JSON.stringify({
            organization: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
              name: 'Alpha Org',
              slug: 'alpha-org',
            },
            membership: { role: 'owner', status: 'active' },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/organizations/01973f83-f22a-73ba-ae76-5a045c52fc91/spaces')) {
        return new Response(
          JSON.stringify({
            space: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc92',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
              name: 'Alpha Space',
              slug: 'alpha-space',
            },
            membership: { role: 'owner', status: 'active' },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/spaces/01973f83-f22a-73ba-ae76-5a045c52fc92/channels')) {
        return new Response(
          JSON.stringify({
            channel: {
              id: channelId,
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
              space_id: '01973f83-f22a-73ba-ae76-5a045c52fc92',
              kind: 'text',
              name: 'general',
              slug: 'general',
              topic: 'Local alpha chat',
              position: 0,
              is_private: false,
              archived_at: null,
            },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith(`/channels/${channelId}/messages`) && init?.method === undefined) {
        return new Response(JSON.stringify({ messages: [] }))
      }
      if (url.endsWith(`/channels/${channelId}/messages`) && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            message: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc94',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
              channel_id: channelId,
              author_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc90',
              content: 'Phase 9 real API message',
              content_format: 'plain',
              attachment_ids: [],
              created_at: '2026-06-24T00:00:00Z',
              edited_at: null,
              deleted_at: null,
            },
          }),
          { status: 201 },
        )
      }
      if (
        url.endsWith('/organizations/01973f83-f22a-73ba-ae76-5a045c52fc91/meetings') &&
        init?.method === undefined
      ) {
        return new Response(JSON.stringify({ meetings: [] }))
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)

    await userEvent.clear(screen.getByLabelText('Local alpha email'))
    await userEvent.type(screen.getByLabelText('Local alpha email'), 'alpha@example.com')
    await userEvent.type(screen.getByLabelText('Local alpha display name'), 'Alpha User')
    await userEvent.type(screen.getByLabelText('Local alpha password'), 'correct horse battery staple')
    await userEvent.click(screen.getByRole('button', { name: 'Start local alpha' }))

    expect(await screen.findByRole('heading', { name: '# general' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message timeline')).toHaveTextContent(
      'No messages yet. Start the channel.',
    )

    await userEvent.type(screen.getByLabelText('Message composer'), 'Phase 9 real API message')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Message timeline')).toHaveTextContent(
        'Phase 9 real API message',
      )
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8080/channels/${channelId}/messages`,
      expect.objectContaining({
        body: JSON.stringify({
          content: 'Phase 9 real API message',
          attachment_ids: [],
        }),
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/organizations',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Alpha alpha Org' }),
        method: 'POST',
      }),
    )
  })

  it('loads seeded rich messages, attachments, channels, and meetings from local alpha', async () => {
    const organizationId = '019ef679-3158-7830-81f5-4b02336e9fa1'
    const spaceId = '019ef679-3160-7813-b9aa-10795e7904d8'
    const textChannelId = '019ef679-3166-7c33-9e32-2c8350a31729'
    const voiceChannelId = '019ef679-3169-74e1-aedd-9365f9ff198d'
    const ownerUserId = '019ef679-303f-72f2-83bd-4501222533f2'
    let voiceJoinRequests = 0

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return new Response(JSON.stringify({ status: 'ok', version: 'test-version' }))
      }
      if (url.endsWith('/auth/register')) {
        return new Response(
          JSON.stringify({
            user: {
              id: ownerUserId,
              email: 'owner@opencord.local',
              display_name: 'OpenCord Owner',
            },
            session: { token: 'seed-session-token' },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/organizations') && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            organizations: [
              {
                id: organizationId,
                name: 'OpenCord Local Alpha',
                slug: 'opencord-local-alpha',
                plan: 'free',
                deployment_mode: 'self_hosted',
                primary_region: 'local',
                created_at: '2026-06-24T00:00:00Z',
                role: 'owner',
              },
            ],
          }),
        )
      }
      if (
        url.endsWith(`/organizations/${organizationId}/spaces`) &&
        init?.method === undefined
      ) {
        return new Response(
          JSON.stringify({
            spaces: [
              {
                id: spaceId,
                organization_id: organizationId,
                name: 'Local Alpha',
                slug: 'local-alpha',
                created_at: '2026-06-24T00:01:00Z',
                role: 'owner',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/spaces/${spaceId}/channels`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            channels: [
              {
                id: textChannelId,
                organization_id: organizationId,
                space_id: spaceId,
                kind: 'text',
                name: 'general',
                slug: 'general',
                topic: 'Local alpha chat, bot, webhook, and attachment smoke tests.',
                position: 0,
                is_private: false,
                archived_at: null,
                created_at: '2026-06-24T00:02:00Z',
              },
              {
                id: voiceChannelId,
                organization_id: organizationId,
                space_id: spaceId,
                kind: 'voice',
                name: 'Voice Lounge',
                slug: 'voice-lounge',
                topic: 'Local alpha voice and screen-share smoke tests.',
                position: 0,
                is_private: false,
                archived_at: null,
                created_at: '2026-06-24T00:02:00Z',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/channels/${textChannelId}/messages`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            messages: [
              {
                id: '019ef679-316c-7d82-a9d8-a9ed23811d2d',
                organization_id: organizationId,
                space_id: spaceId,
                channel_id: textChannelId,
                author_user_id: ownerUserId,
                content: 'Welcome to the OpenCord local alpha workspace.',
                content_format: 'plain',
                embeds: [],
                components: [],
                reply_to_message_id: null,
                attachments: [],
                created_at: '2026-06-24T00:03:00Z',
                edited_at: null,
                deleted_at: null,
              },
              {
                id: '019ef679-316f-70c1-ae0d-2efbe0b99457',
                organization_id: organizationId,
                space_id: spaceId,
                channel_id: textChannelId,
                author_user_id: ownerUserId,
                content: 'Local alpha rich message fixture.',
                content_format: 'plain',
                embeds: [
                  {
                    type: 'rich',
                    title: 'OpenCord Local Alpha',
                    description: 'Fixture for rich message rendering.',
                    color: 3726513,
                    fields: [
                      {
                        name: 'Surface',
                        value: 'embeds, mentions, replies, and components',
                        inline: true,
                      },
                    ],
                    footer: { text: 'Phase 09' },
                  },
                ],
                components: [{ type: 1, components: [] }],
                mention_user_ids: [ownerUserId],
                mention_role_ids: [],
                mention_everyone: true,
                reply_to_message_id: '019ef679-316c-7d82-a9d8-a9ed23811d2d',
                attachments: [],
                created_at: '2026-06-24T00:04:00Z',
                edited_at: null,
                deleted_at: null,
              },
              {
                id: '019ef679-3172-7b61-a82d-d3b68d5c68b7',
                organization_id: organizationId,
                space_id: spaceId,
                channel_id: textChannelId,
                author_user_id: ownerUserId,
                content: 'Local alpha attachment fixture.',
                content_format: 'plain',
                embeds: [],
                components: [],
                reply_to_message_id: null,
                attachments: [
                  {
                    id: '019ef679-3175-7cd2-ba44-4cc2481dfab1',
                    organization_id: organizationId,
                    space_id: spaceId,
                    channel_id: textChannelId,
                    message_id: '019ef679-3172-7b61-a82d-d3b68d5c68b7',
                    uploader_user_id: ownerUserId,
                    file_name: 'local-alpha-readme.txt',
                    content_type: 'text/plain',
                    size_bytes: 87,
                    status: 'linked',
                    download_url:
                      'http://localhost:8080/attachments/019ef679-3175-7cd2-ba44-4cc2481dfab1/content',
                  },
                ],
                created_at: '2026-06-24T00:05:00Z',
                edited_at: null,
                deleted_at: null,
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/organizations/${organizationId}/meetings`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            meetings: [
              {
                id: '019ef679-3187-7331-a2bd-aa8b5ade1e57',
                organization_id: organizationId,
                space_id: spaceId,
                channel_id: textChannelId,
                created_by_user_id: ownerUserId,
                title: 'OpenCord Local Alpha Standup',
                description: 'Local alpha meeting fixture.',
                status: 'scheduled',
                starts_at: '2099-01-09T09:00:00Z',
                ends_at: '2099-01-09T09:30:00Z',
                timezone: 'UTC',
                join_slug: 'mtg-019ef67931877331a2bdaa8b5ade1e57',
                join_url:
                  'http://localhost:8080/join/mtg-019ef67931877331a2bdaa8b5ade1e57',
                cancelled_at: null,
                attendees: [],
                reminders: [],
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/voice/channels/${voiceChannelId}/join`) && init?.method === 'POST') {
        voiceJoinRequests += 1
        return new Response(
          JSON.stringify({
            voice: {
              channel_id: voiceChannelId,
              user_id: ownerUserId,
              self_mute: false,
              self_deaf: false,
            },
            media: {
              provider: 'livekit',
              server_url: 'ws://localhost:7880',
              region: 'local',
              room_type: 'voice_channel',
              room_name: `opencord_voice_${voiceChannelId.replaceAll('-', '')}`,
              organization_id: organizationId,
              space_id: spaceId,
              channel_id: voiceChannelId,
              participant_identity: ownerUserId,
              participant_token: 'livekit.jwt',
              expires_at: '2026-06-24T00:10:00Z',
                grants: {
                  can_publish_audio: true,
                  can_publish_video: false,
                  can_publish_screen: true,
                  can_subscribe: true,
                },
            },
          }),
          { status: 201 },
        )
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)

    await userEvent.clear(screen.getByLabelText('Local alpha email'))
    await userEvent.type(screen.getByLabelText('Local alpha email'), 'owner@opencord.local')
    await userEvent.clear(screen.getByLabelText('Local alpha display name'))
    await userEvent.type(screen.getByLabelText('Local alpha display name'), 'OpenCord Owner')
    await userEvent.type(screen.getByLabelText('Local alpha password'), 'correct horse battery staple')
    await userEvent.click(screen.getByRole('button', { name: 'Start local alpha' }))

    const timeline = await screen.findByLabelText('Message timeline')
    expect(timeline).toHaveTextContent('Welcome to the OpenCord local alpha workspace.')
    expect(timeline).toHaveTextContent('Local alpha rich message fixture.')
    expect(timeline).toHaveTextContent('Local alpha attachment fixture.')
    expect(
      within(timeline).getByRole('article', { name: 'Rich embed: OpenCord Local Alpha' }),
    ).toHaveTextContent('Fixture for rich message rendering.')
    expect(timeline).toHaveTextContent('local-alpha-readme.txt')
    expect(timeline).toHaveTextContent('text/plain')
    expect(timeline).toHaveTextContent('87 B')
    expect(screen.getByRole('button', { name: 'Join Voice: Voice Lounge' })).toBeInTheDocument()

    const rtcConfig: RTCConfiguration = {
      iceServers: [
        {
          credential: 'opencord-turn-password',
          urls: ['turn:localhost:3478?transport=udp'],
          username: 'opencord',
        },
      ],
      iceTransportPolicy: 'relay',
    }
    ;(window as Window & { __OPENCORD_MEDIA_RTC_CONFIG__?: RTCConfiguration })
      .__OPENCORD_MEDIA_RTC_CONFIG__ = rtcConfig

    await userEvent.click(screen.getByRole('button', { name: 'Join Voice: Voice Lounge' }))

    await waitFor(() => {
      expect(voiceJoinRequests).toBe(1)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8080/voice/channels/${voiceChannelId}/join`,
      expect.objectContaining({
        body: JSON.stringify({ self_mute: false, self_deaf: false }),
        method: 'POST',
      }),
    )
    expect(mediaMocks.connectLiveKitVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: 'ws://localhost:7880',
        participantToken: 'livekit.jwt',
        roomName: `opencord_voice_${voiceChannelId.replaceAll('-', '')}`,
        participantIdentity: ownerUserId,
        grants: {
          canPublishAudio: true,
          canPublishVideo: false,
          canPublishScreen: true,
          canSubscribe: true,
        },
        selfMute: false,
        selfDeaf: false,
        rtcConfig,
      }),
    )
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Voice Lounge')

    const screenShareStop = vi.fn()
    let screenShareEndedListener: (() => void) | undefined
    const screenShare = stubScreenShare({
      track: createScreenShareTrack({
        onEnded(listener) {
          screenShareEndedListener = listener
        },
        stop: screenShareStop,
      }),
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share screen' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }))
    await waitFor(() => {
      expect(mediaMocks.lastVoiceSession?.publishScreenShare).toHaveBeenCalled()
    })
    expect(mediaMocks.lastVoiceSession?.publishScreenShare).toHaveBeenCalledWith(
      expect.objectContaining({
        getVideoTracks: expect.any(Function),
      }),
    )
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Screen sharing')
    expect(screenShare.getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true })

    await act(async () => {
      screenShareEndedListener?.()
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument()
    })
    expect(mediaMocks.lastVoiceSession?.stopScreenShare).toHaveBeenCalledTimes(1)
    expect(screenShareStop).not.toHaveBeenCalled()

    stubScreenShare({
      error: new DOMException('Permission denied', 'NotAllowedError'),
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share screen' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Screen share blocked')
    })

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    const upcomingMeetings = screen.getByLabelText('Upcoming meetings')
    expect(upcomingMeetings).toHaveTextContent('OpenCord Local Alpha Standup')
    expect(upcomingMeetings).toHaveTextContent(
      'http://localhost:8080/join/mtg-019ef67931877331a2bdaa8b5ade1e57',
    )
    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        const request = init as RequestInit | undefined
        const headers = request?.headers as Record<string, string> | undefined
        return (
          String(url) === 'http://localhost:8080/organizations' &&
          request?.method === 'POST' &&
          headers?.Authorization === 'Bearer seed-session-token'
        )
      }),
    ).toBe(false)
  })

  it('disconnects quiet voice media when realtime revokes connect permission', async () => {
    const organizationId = '019ef679-3158-7830-81f5-4b02336e9fa1'
    const spaceId = '019ef679-3160-7813-b9aa-10795e7904d8'
    const textChannelId = '019ef679-3166-7c33-9e32-2c8350a31729'
    const voiceChannelId = '019ef679-3169-74e1-aedd-9365f9ff198d'
    const ownerUserId = '019ef679-303f-72f2-83bd-4501222533f2'
    const realtimeSockets: TestRealtimeSocket[] = []
    vi.stubGlobal(
      'WebSocket',
      class extends TestRealtimeSocket {
        constructor(url: string) {
          super(url)
          realtimeSockets.push(this)
        }
      },
    )
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return new Response(JSON.stringify({ status: 'ok', version: 'test-version' }))
      }
      if (url.endsWith('/auth/register')) {
        return new Response(
          JSON.stringify({
            user: {
              id: ownerUserId,
              email: 'owner@opencord.local',
              display_name: 'OpenCord Owner',
            },
            session: { token: 'seed-session-token' },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/organizations') && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            organizations: [
              {
                id: organizationId,
                name: 'OpenCord Local Alpha',
                slug: 'opencord-local-alpha',
                plan: 'free',
                deployment_mode: 'self_hosted',
                primary_region: 'local',
                created_at: '2026-06-24T00:00:00Z',
                role: 'owner',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/organizations/${organizationId}/spaces`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            spaces: [
              {
                id: spaceId,
                organization_id: organizationId,
                name: 'Local Alpha',
                slug: 'local-alpha',
                created_at: '2026-06-24T00:01:00Z',
                role: 'owner',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/spaces/${spaceId}/channels`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            channels: [
              {
                id: textChannelId,
                organization_id: organizationId,
                space_id: spaceId,
                kind: 'text',
                name: 'general',
                slug: 'general',
                topic: 'Local alpha chat.',
                position: 0,
                is_private: false,
                archived_at: null,
                created_at: '2026-06-24T00:02:00Z',
              },
              {
                id: voiceChannelId,
                organization_id: organizationId,
                space_id: spaceId,
                kind: 'voice',
                name: 'Voice Lounge',
                slug: 'voice-lounge',
                topic: 'Local alpha voice.',
                position: 1,
                is_private: false,
                archived_at: null,
                created_at: '2026-06-24T00:03:00Z',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/channels/${textChannelId}/messages`) && init?.method === undefined) {
        return new Response(JSON.stringify({ messages: [] }))
      }
      if (url.endsWith(`/organizations/${organizationId}/meetings`) && init?.method === undefined) {
        return new Response(JSON.stringify({ meetings: [] }))
      }
      if (url.endsWith(`/voice/channels/${voiceChannelId}/join`) && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            voice: {
              channel_id: voiceChannelId,
              user_id: ownerUserId,
              self_mute: false,
              self_deaf: false,
            },
            media: {
              provider: 'livekit',
              server_url: 'ws://localhost:7880',
              region: 'local',
              room_type: 'voice_channel',
              room_name: `opencord_voice_${voiceChannelId.replaceAll('-', '')}`,
              organization_id: organizationId,
              space_id: spaceId,
              channel_id: voiceChannelId,
              participant_identity: ownerUserId,
              participant_token: 'livekit.jwt',
              expires_at: '2026-06-24T00:10:00Z',
              grants: {
                can_publish_audio: true,
                can_publish_video: false,
                can_publish_screen: true,
                can_subscribe: true,
              },
            },
          }),
          { status: 201 },
        )
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)

    await userEvent.clear(screen.getByLabelText('Local alpha email'))
    await userEvent.type(screen.getByLabelText('Local alpha email'), 'owner@opencord.local')
    await userEvent.clear(screen.getByLabelText('Local alpha display name'))
    await userEvent.type(screen.getByLabelText('Local alpha display name'), 'OpenCord Owner')
    await userEvent.type(screen.getByLabelText('Local alpha password'), 'correct horse battery staple')
    await userEvent.click(screen.getByRole('button', { name: 'Start local alpha' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Join Voice: Voice Lounge' }))

    await waitFor(() => {
      expect(realtimeSockets).toHaveLength(1)
    })
    const screenShareStop = vi.fn()
    stubScreenShare({
      track: createScreenShareTrack({ stop: screenShareStop }),
    })
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Share screen' })).toBeEnabled()
    })
    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }))
    await waitFor(() => {
      expect(mediaMocks.lastVoiceSession?.publishScreenShare).toHaveBeenCalled()
    })
    realtimeSockets[0].emit({
      id: 'evt_media_restrict_publish',
      type: 'media.permission_revoked',
      organization_id: organizationId,
      scope: {
        space_id: spaceId,
        channel_id: voiceChannelId,
      },
      occurred_at: '2026-06-24T00:04:00.000Z',
      data: {
        channel_id: voiceChannelId,
        target_kind: 'member',
        target_id: ownerUserId,
        action: 'restrict_publish',
        grants: {
          can_publish_audio: true,
          can_publish_screen: false,
          can_subscribe: true,
        },
      },
    })

    await waitFor(() => {
      expect(mediaMocks.lastVoiceSession?.stopScreenShare).toHaveBeenCalled()
    })
    expect(screenShareStop).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Voice permissions changed. Screen sharing stopped.',
    )
    realtimeSockets[0].emit({
      id: 'evt_media_revoke',
      type: 'media.permission_revoked',
      organization_id: organizationId,
      scope: {
        space_id: spaceId,
        channel_id: voiceChannelId,
      },
      occurred_at: '2026-06-24T00:04:00.000Z',
      data: {
        channel_id: voiceChannelId,
        target_kind: 'member',
        target_id: ownerUserId,
        action: 'disconnect',
        grants: {
          can_publish_audio: false,
          can_publish_screen: false,
          can_subscribe: true,
        },
      },
    })

    await waitFor(() => {
      expect(mediaMocks.lastVoiceSession?.disconnect).toHaveBeenCalled()
    })
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Not connected')
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Voice access changed. You were removed from the channel.',
    )
  })

  it('renders typed workspace routes for channel, calendar, developer, and meeting surfaces', async () => {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: ['/servers/local/spaces/opencord/channels/general/calendar'],
      }),
    })

    render(<App router={router} />)

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument()

    await router.navigate({
      to: '/servers/$serverId/spaces/$spaceId/channels/$channelId/developers',
      params: { serverId: 'local', spaceId: 'opencord', channelId: 'general' },
    })

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Developer settings' })).toBeInTheDocument()
    })

    await router.navigate({
      to: '/servers/$serverId/spaces/$spaceId/channels/$channelId/meetings/$meetingId',
      params: {
        serverId: 'local',
        spaceId: 'opencord',
        channelId: 'general',
        meetingId: 'meeting-roadmap-review',
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '# general' })).toBeInTheDocument()
    })
  })

  it('renders top-level shortcut routes for calendar, developers, and meetings', async () => {
    const router = createAppRouter({
      history: createMemoryHistory({
        initialEntries: ['/calendar'],
      }),
    })

    render(<App router={router} />)

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument()

    await router.navigate({ to: '/developers' })

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Developer settings' })).toBeInTheDocument()
    })

    await router.navigate({
      to: '/meetings/$meetingId',
      params: { meetingId: 'meeting-roadmap-review' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Leave meeting' })).toBeInTheDocument()
    })
  })

  it('renders Discord-style rich embed cards in the message timeline', () => {
    render(<App />)

    const timeline = screen.getByLabelText('Message timeline')
    const embed = within(timeline).getByRole('article', {
      name: 'Rich embed: Deploy preview ready',
    })

    expect(embed).toHaveTextContent('Deploy preview ready')
    expect(embed).toHaveTextContent('Webhook embed payloads now render in official clients.')
    expect(embed).toHaveTextContent('Environment')
    expect(embed).toHaveTextContent('production')
    expect(embed).toHaveTextContent('Version')
    expect(embed).toHaveTextContent('2026.06.24')
    expect(embed).toHaveTextContent('Release Hook')
  })

  it('sends, edits, and deletes a local message in the selected channel', async () => {
    render(<App />)

    await userEvent.type(screen.getByLabelText('Message composer'), 'Shipping the chat UI')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    const timeline = screen.getByLabelText('Message timeline')
    expect(timeline).toHaveTextContent('Shipping the chat UI')

    const sentMessage = within(timeline).getByText('Shipping the chat UI').closest('article')
    expect(sentMessage).not.toBeNull()

    await userEvent.click(within(sentMessage!).getByRole('button', { name: 'Edit message' }))
    await userEvent.clear(screen.getByLabelText('Edit message text'))
    await userEvent.type(screen.getByLabelText('Edit message text'), 'Shipping the polished chat UI')
    await userEvent.click(screen.getByRole('button', { name: 'Save edit' }))

    expect(timeline).toHaveTextContent('Shipping the polished chat UI')

    await userEvent.click(within(sentMessage!).getByRole('button', { name: 'Delete message' }))
    expect(timeline).not.toHaveTextContent('Shipping the polished chat UI')
  })

  it('attaches a local file preview to a sent message', async () => {
    render(<App />)

    const file = new File(['image-bytes'], 'diagram.png', { type: 'image/png' })

    await userEvent.upload(screen.getByLabelText('Attach file'), file)
    expect(screen.getByText('diagram.png')).toBeInTheDocument()
    expect(screen.getByLabelText('Pending attachments')).toHaveTextContent('11 B')

    await userEvent.type(screen.getByLabelText('Message composer'), 'See attached diagram')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    const timeline = screen.getByLabelText('Message timeline')
    const sentMessage = within(timeline).getByText('See attached diagram').closest('article')
    expect(sentMessage).not.toBeNull()
    expect(within(sentMessage!).getByText('diagram.png')).toBeInTheDocument()
    expect(within(sentMessage!).getByText('image/png')).toBeInTheDocument()
    expect(screen.queryByLabelText('Pending attachments')).not.toBeInTheDocument()
  })

  it('removes a pending attachment before sending', async () => {
    render(<App />)

    await userEvent.upload(
      screen.getByLabelText('Attach file'),
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    )
    expect(screen.getByText('notes.txt')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }))

    expect(screen.queryByText('notes.txt')).not.toBeInTheDocument()
  })

  it('creates and selects a new text channel', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Create channel' }))
    await userEvent.type(screen.getByLabelText('New channel name'), 'launch-room')
    await userEvent.click(screen.getByRole('button', { name: 'Add channel' }))

    await userEvent.click(screen.getByRole('button', { name: '# launch-room' }))

    expect(screen.getByRole('heading', { name: '# launch-room' })).toBeInTheDocument()
    expect(screen.getByLabelText('Message timeline')).toHaveTextContent(
      'No messages yet. Start the channel.',
    )
  })

  it('shows a permission denial state for read-only channels', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: '# announcements' }))

    expect(screen.getByText('You can view this channel but cannot send messages.')).toBeInTheDocument()
    expect(screen.getByLabelText('Message composer')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('shows the calendar tab and creates a local meeting', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument()
    const upcomingMeetings = screen.getByLabelText('Upcoming meetings')
    expect(upcomingMeetings).toHaveTextContent('Roadmap Review')
    expect(upcomingMeetings).toHaveTextContent('Join URL')

    await userEvent.click(screen.getByRole('button', { name: 'New meeting' }))

    const dialog = screen.getByRole('dialog', { name: 'Create meeting' })
    await userEvent.type(within(dialog).getByLabelText('Meeting title'), 'Design Sync')
    fireEvent.change(within(dialog).getByLabelText('Start time'), {
      target: { value: '2026-06-25T10:00' },
    })
    fireEvent.change(within(dialog).getByLabelText('End time'), {
      target: { value: '2026-06-25T10:30' },
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create meeting' }))

    expect(screen.queryByRole('dialog', { name: 'Create meeting' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Upcoming meetings')).toHaveTextContent('Design Sync')
    expect(screen.getByLabelText('Upcoming meetings')).toHaveTextContent(
      'http://localhost:8080/join/local-design-sync',
    )
  })

  it('creates, rotates, and invites a bot from developer settings', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    expect(
      within(developerSettings).getByRole('heading', { name: 'Developer settings' }),
    ).toBeInTheDocument()
    expect(developerSettings).toHaveTextContent('0 bot applications')
    expect(within(developerSettings).getByLabelText('Read messages')).toBeChecked()
    expect(within(developerSettings).getByLabelText('Send messages')).toBeChecked()
    expect(within(developerSettings).getByLabelText('Use slash commands')).toBeChecked()
    await userEvent.click(within(developerSettings).getByLabelText('Manage webhooks'))

    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application name'),
      'Deploy Bot',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application description'),
      'Posts release status into operations channels',
    )
    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Create bot application' }),
    )

    expect(developerSettings).toHaveTextContent('Deploy Bot')
    expect(developerSettings).toHaveTextContent('Posts release status into operations channels')
    const initialToken = within(developerSettings).getByLabelText('Shown-once bot token').textContent
    expect(initialToken).toMatch(/^ocb_/)
    expect(developerSettings).toHaveTextContent('/api/compat/discord/v10')
    expect(developerSettings).toHaveTextContent('/api/compat/discord/gateway')
    const botApplications = within(developerSettings).getByRole('region', {
      name: 'Bot applications',
    })
    expect(botApplications).toHaveTextContent('Read messages')
    expect(botApplications).toHaveTextContent('Send messages')
    expect(botApplications).toHaveTextContent('Use slash commands')
    expect(botApplications).toHaveTextContent('Manage webhooks')

    const auditEvents = within(developerSettings).getByRole('region', {
      name: 'Developer audit events',
    })
    expect(auditEvents).toHaveTextContent('bot.created')
    expect(auditEvents).toHaveTextContent('Deploy Bot')
    expect(auditEvents).toHaveTextContent('Manage webhooks')
    expect(auditEvents).not.toHaveTextContent(initialToken ?? '')

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Rotate token for Deploy Bot',
      }),
    )

    const rotatedToken = within(developerSettings).getByLabelText('Shown-once bot token').textContent
    expect(rotatedToken).toMatch(/^ocb_/)
    expect(rotatedToken).not.toBe(initialToken)
    expect(auditEvents).toHaveTextContent('bot.token_rotated')
    expect(auditEvents).not.toHaveTextContent(rotatedToken ?? '')

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Invite Deploy Bot to OpenCord',
      }),
    )

    expect(developerSettings).toHaveTextContent('Invited to OpenCord')
    expect(auditEvents).toHaveTextContent('bot.invited_to_space')
  })

  it('uses server-backed developer bot APIs when server context is configured', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', version: 'test-version' }),
        }
      }

      if (url.endsWith('/organizations/01973f83-f22a-73ba-ae76-5a045c52fc96/bot-applications')) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            bot_application: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
              bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
              created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc99',
              name: 'Deploy Bot',
              description: 'Posts release status into operations channels',
              status: 'active',
            },
            bot_token: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fca0',
              application_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              token: 'ocb_server_created',
              token_last_four: 'ated',
            },
          }),
        }
      }

      if (url.endsWith('/bot-applications/01973f83-f22a-73ba-ae76-5a045c52fc97/tokens/rotate')) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            bot_token: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fca1',
              application_id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              token: 'ocb_server_rotated',
              token_last_four: 'ated',
            },
          }),
        }
      }

      if (
        url.endsWith(
          '/bot-applications/01973f83-f22a-73ba-ae76-5a045c52fc97/spaces/01973f83-f22a-73ba-ae76-5a045c52fca2/invite',
        )
      ) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            bot_application: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
              bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
              created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc99',
              name: 'Deploy Bot',
              description: 'Posts release status into operations channels',
              status: 'active',
            },
            member: {
              space_id: '01973f83-f22a-73ba-ae76-5a045c52fca2',
              user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
              role: 'member',
              status: 'active',
            },
          }),
        }
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    await userEvent.type(within(developerSettings).getByLabelText('Session token'), 'session-token')
    await userEvent.type(
      within(developerSettings).getByLabelText('Organization ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fc96',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Space ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fca2',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application name'),
      'Deploy Bot',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Bot application description'),
      'Posts release status into operations channels',
    )
    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Create bot application' }),
    )

    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('ocb_server_created')
    })

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Rotate token for Deploy Bot',
      }),
    )
    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('ocb_server_rotated')
    })

    await userEvent.click(
      within(developerSettings).getByRole('button', {
        name: 'Invite Deploy Bot to OpenCord',
      }),
    )
    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('Invited to OpenCord')
    })
  })

  it('loads existing server bot applications into developer settings', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', version: 'test-version' }),
        }
      }

      if (url.endsWith('/organizations/01973f83-f22a-73ba-ae76-5a045c52fc96/bot-applications')) {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        expect(init?.method).toBeUndefined()
        return {
          ok: true,
          json: async () => ({
            bot_applications: [
              {
                bot_application: {
                  id: '01973f83-f22a-73ba-ae76-5a045c52fc97',
                  organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
                  bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
                  created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc99',
                  name: 'Loaded Bot',
                  description: null,
                  status: 'active',
                },
                active_token_last_four: 'last',
                space_memberships: [
                  {
                    space_id: '01973f83-f22a-73ba-ae76-5a045c52fca2',
                    user_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
                    role: 'member',
                    status: 'active',
                  },
                ],
              },
            ],
          }),
        }
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    await userEvent.type(within(developerSettings).getByLabelText('Session token'), 'session-token')
    await userEvent.type(
      within(developerSettings).getByLabelText('Organization ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fc96',
    )
    await userEvent.type(
      within(developerSettings).getByLabelText('Space ID'),
      '01973f83-f22a-73ba-ae76-5a045c52fca2',
    )
    await userEvent.click(within(developerSettings).getByRole('button', { name: 'Load server bots' }))

    await waitFor(() => {
      expect(developerSettings).toHaveTextContent('Loaded Bot')
    })
    expect(developerSettings).toHaveTextContent('No description')
    expect(developerSettings).toHaveTextContent('Hidden after creation - last 4 last')
    expect(developerSettings).toHaveTextContent('Invited to OpenCord')
  })

  it('manages server incoming webhooks from developer settings', async () => {
    const channelId = '01973f83-f22a-73ba-ae76-5a045c52fce4'
    const webhookPayload = {
      id: '01973f83-f22a-73ba-ae76-5a045c52fce1',
      organization_id: '01973f83-f22a-73ba-ae76-5a045c52fce2',
      space_id: '01973f83-f22a-73ba-ae76-5a045c52fce3',
      channel_id: channelId,
      bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fce5',
      created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fce6',
      name: 'Release Hook',
      status: 'active',
      token_last_four: 'ated',
      created_at: '2026-06-23T09:00:00.000Z',
    }

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', version: 'test-version' }),
        }
      }

      if (url.endsWith(`/channels/${channelId}/webhooks`) && init?.method === 'POST') {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            webhook: {
              ...webhookPayload,
              token: 'ocw_server_created',
              execute_url:
                'http://localhost:8080/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_server_created',
            },
          }),
        }
      }

      if (url.endsWith(`/channels/${channelId}/webhooks`) && init?.method === undefined) {
        expect(init).toMatchObject({
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            webhooks: [webhookPayload],
          }),
        }
      }

      if (
        url.endsWith(
          `/channels/${channelId}/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/token/rotate`,
        )
      ) {
        expect(init).toMatchObject({
          method: 'POST',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          json: async () => ({
            webhook: {
              ...webhookPayload,
              token: 'ocw_server_rotated',
              execute_url:
                'http://localhost:8080/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_server_rotated',
            },
          }),
        }
      }

      if (url.endsWith(`/channels/${channelId}/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1`)) {
        expect(init).toMatchObject({
          method: 'DELETE',
          headers: {
            Authorization: 'Bearer session-token',
          },
        })
        return {
          ok: true,
          status: 204,
          json: async () => {
            throw new Error('empty response')
          },
        }
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Developer' }))

    const developerSettings = screen.getByRole('region', { name: 'Developer settings' })
    await userEvent.type(within(developerSettings).getByLabelText('Session token'), 'session-token')
    await userEvent.type(within(developerSettings).getByLabelText('Webhook channel ID'), channelId)
    await userEvent.type(within(developerSettings).getByLabelText('Webhook name'), 'Release Hook')
    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Create incoming webhook' }),
    )

    const webhooks = within(developerSettings).getByRole('region', {
      name: 'Incoming webhooks',
    })
    await waitFor(() => {
      expect(webhooks).toHaveTextContent('ocw_server_created')
    })

    await userEvent.click(
      within(developerSettings).getByRole('button', { name: 'Load server webhooks' }),
    )
    await waitFor(() => {
      expect(webhooks).toHaveTextContent('Hidden after creation - last 4 ated')
    })

    await userEvent.click(
      within(webhooks).getByRole('button', {
        name: 'Rotate webhook token for Release Hook',
      }),
    )
    await waitFor(() => {
      expect(webhooks).toHaveTextContent('ocw_server_rotated')
    })

    await userEvent.click(
      within(webhooks).getByRole('button', {
        name: 'Delete webhook Release Hook',
      }),
    )
    await waitFor(() => {
      expect(webhooks).not.toHaveTextContent('Release Hook')
    })
    const auditEvents = within(developerSettings).getByRole('region', {
      name: 'Developer audit events',
    })
    expect(auditEvents).toHaveTextContent('webhook.created')
    expect(auditEvents).toHaveTextContent('webhook.loaded')
    expect(auditEvents).toHaveTextContent('webhook.token_rotated')
    expect(auditEvents).toHaveTextContent('webhook.deleted')
    expect(auditEvents).not.toHaveTextContent('ocw_server_created')
    expect(auditEvents).not.toHaveTextContent('ocw_server_rotated')
  })

  it('opens and leaves a meeting room from the calendar', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))

    const upcomingMeetings = screen.getByLabelText('Upcoming meetings')
    const roadmapMeeting = within(upcomingMeetings).getByText('Roadmap Review').closest('article')
    expect(roadmapMeeting).not.toBeNull()

    await userEvent.click(
      within(roadmapMeeting!).getByRole('button', { name: 'Join meeting Roadmap Review' }),
    )

    const meetingRoom = screen.getByRole('region', { name: 'Meeting room' })
    expect(meetingRoom).toHaveTextContent('Roadmap Review')
    expect(meetingRoom).toHaveTextContent('Media room connected')
    expect(meetingRoom).toHaveTextContent('http://localhost:8080/join/mtg-roadmap-review')
    expect(within(meetingRoom).getByLabelText('You connected')).toBeInTheDocument()
    expect(within(meetingRoom).getByLabelText('Mira connected')).toBeInTheDocument()

    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Mute meeting microphone' }))
    expect(within(meetingRoom).getByRole('button', { name: 'Unmute meeting microphone' })).toBeInTheDocument()

    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Turn camera off' }))
    expect(within(meetingRoom).getByRole('button', { name: 'Turn camera on' })).toBeInTheDocument()

    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Leave meeting' }))

    expect(screen.queryByRole('region', { name: 'Meeting room' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Calendar' })).toBeInTheDocument()
  })

  it('joins a server-backed meeting room with LiveKit media controls', async () => {
    const organizationId = '01973f83-f22a-73ba-ae76-5a045c52fc91'
    const spaceId = '01973f83-f22a-73ba-ae76-5a045c52fc92'
    const textChannelId = '01973f83-f22a-73ba-ae76-5a045c52fc93'
    const voiceChannelId = '01973f83-f22a-73ba-ae76-5a045c52fc94'
    const ownerUserId = '01973f83-f22a-73ba-ae76-5a045c52fc97'
    const meetingId = '019ef679-3187-7331-a2bd-aa8b5ade1e57'
    let meetingMediaRequests = 0

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/healthz')) {
        return new Response(JSON.stringify({ version: 'test-version' }))
      }
      if (url.endsWith('/auth/register') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            user: {
              id: ownerUserId,
              email: 'owner@opencord.local',
              display_name: 'OpenCord Owner',
            },
            session: { token: 'seed-session-token' },
          }),
          { status: 201 },
        )
      }
      if (url.endsWith('/organizations') && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            organizations: [
              {
                id: organizationId,
                name: 'OpenCord Local',
                slug: 'opencord-local',
                plan: 'self_hosted',
                deployment_mode: 'self_hosted',
                primary_region: 'local',
                created_at: '2026-06-24T00:00:00Z',
                role: 'owner',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/organizations/${organizationId}/spaces`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            spaces: [
              {
                id: spaceId,
                organization_id: organizationId,
                name: 'OpenCord',
                slug: 'opencord',
                created_at: '2026-06-24T00:01:00Z',
                role: 'owner',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/spaces/${spaceId}/channels`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            channels: [
              {
                id: textChannelId,
                organization_id: organizationId,
                space_id: spaceId,
                kind: 'text',
                name: 'general',
                slug: 'general',
                topic: 'Local alpha chat',
                position: 0,
                is_private: false,
                archived_at: null,
                created_at: '2026-06-24T00:02:00Z',
              },
              {
                id: voiceChannelId,
                organization_id: organizationId,
                space_id: spaceId,
                kind: 'voice',
                name: 'Voice Lounge',
                slug: 'voice-lounge',
                topic: null,
                position: 1,
                is_private: false,
                archived_at: null,
                created_at: '2026-06-24T00:03:00Z',
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/channels/${textChannelId}/messages`) && init?.method === undefined) {
        return new Response(JSON.stringify({ messages: [] }))
      }
      if (url.endsWith(`/organizations/${organizationId}/meetings`) && init?.method === undefined) {
        return new Response(
          JSON.stringify({
            meetings: [
              {
                id: meetingId,
                organization_id: organizationId,
                space_id: spaceId,
                channel_id: textChannelId,
                created_by_user_id: ownerUserId,
                title: 'OpenCord Local Alpha Standup',
                description: 'Local alpha meeting fixture.',
                status: 'scheduled',
                starts_at: '2099-01-09T09:00:00Z',
                ends_at: '2099-01-09T09:30:00Z',
                timezone: 'UTC',
                join_slug: 'mtg-019ef67931877331a2bdaa8b5ade1e57',
                join_url:
                  'http://localhost:8080/join/mtg-019ef67931877331a2bdaa8b5ade1e57',
                cancelled_at: null,
                attendees: [],
                reminders: [],
              },
            ],
          }),
        )
      }
      if (url.endsWith(`/meetings/${meetingId}/media/token`) && init?.method === 'POST') {
        meetingMediaRequests += 1
        return new Response(
          JSON.stringify({
            media: {
              provider: 'livekit',
              server_url: 'ws://localhost:7880',
              region: 'local',
              room_type: 'meeting_room',
              room_name: `opencord_meeting_${meetingId.replaceAll('-', '')}`,
              organization_id: organizationId,
              space_id: spaceId,
              channel_id: textChannelId,
              meeting_id: meetingId,
              participant_identity: ownerUserId,
              participant_token: 'meeting.livekit.jwt',
              expires_at: '2026-06-24T00:10:00Z',
              grants: {
                can_publish_audio: true,
                can_publish_video: true,
                can_publish_screen: true,
                can_subscribe: true,
              },
            },
          }),
          { status: 201 },
        )
      }

      throw new Error(`Unexpected fetch ${url}`)
    })

    render(<App />)

    await userEvent.clear(screen.getByLabelText('Local alpha email'))
    await userEvent.type(screen.getByLabelText('Local alpha email'), 'owner@opencord.local')
    await userEvent.clear(screen.getByLabelText('Local alpha display name'))
    await userEvent.type(screen.getByLabelText('Local alpha display name'), 'OpenCord Owner')
    await userEvent.type(screen.getByLabelText('Local alpha password'), 'correct horse battery staple')
    await userEvent.click(screen.getByRole('button', { name: 'Start local alpha' }))

    await screen.findByRole('button', { name: 'Calendar' })
    await userEvent.click(screen.getByRole('button', { name: 'Calendar' }))
    const meeting = within(screen.getByLabelText('Upcoming meetings'))
      .getByText('OpenCord Local Alpha Standup')
      .closest('article')
    expect(meeting).not.toBeNull()

    await userEvent.click(
      within(meeting!).getByRole('button', {
        name: 'Join meeting OpenCord Local Alpha Standup',
      }),
    )

    await waitFor(() => {
      expect(meetingMediaRequests).toBe(1)
    })
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8080/meetings/${meetingId}/media/token`,
      expect.objectContaining({
        body: JSON.stringify({
          can_publish_audio: true,
          can_publish_video: true,
          can_publish_screen: true,
          can_subscribe: true,
        }),
        method: 'POST',
      }),
    )
    expect(mediaMocks.connectLiveKitVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        serverUrl: 'ws://localhost:7880',
        participantToken: 'meeting.livekit.jwt',
        roomName: `opencord_meeting_${meetingId.replaceAll('-', '')}`,
        participantIdentity: ownerUserId,
        grants: {
          canPublishAudio: true,
          canPublishVideo: true,
          canPublishScreen: true,
          canSubscribe: true,
        },
        selfMute: false,
        selfDeaf: false,
      }),
    )

    const meetingRoom = screen.getByRole('region', { name: 'Meeting room' })
    expect(meetingRoom).toHaveTextContent('Media room connected')
    await userEvent.click(
      within(meetingRoom).getByRole('button', { name: 'Mute meeting microphone' }),
    )
    expect(mediaMocks.lastVoiceSession?.setMuted).toHaveBeenCalledWith(true)

    const screenShareStop = vi.fn()
    const screenShare = stubScreenShare({
      track: createScreenShareTrack({ stop: screenShareStop }),
    })
    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Share meeting screen' }))
    await waitFor(() => {
      expect(mediaMocks.lastVoiceSession?.publishScreenShare).toHaveBeenCalled()
    })
    expect(screenShare.getDisplayMedia).toHaveBeenCalledWith({ audio: false, video: true })

    await userEvent.click(within(meetingRoom).getByRole('button', { name: 'Leave meeting' }))
    expect(mediaMocks.lastVoiceSession?.disconnect).toHaveBeenCalled()
    expect(screenShareStop).toHaveBeenCalledTimes(1)
  })

  it('shows voice channels with connected users and local controls', async () => {
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: 'Channel navigation' })
    expect(within(navigation).getByText('Voice channels')).toBeInTheDocument()
    expect(within(navigation).getByRole('button', { name: 'Voice: Standup' })).toBeInTheDocument()
    const currentVoice = screen.getByLabelText('Current voice participants')
    expect(within(currentVoice).getByLabelText('Thanet speaking')).toBeInTheDocument()
    expect(within(currentVoice).getByLabelText('You connected')).toBeInTheDocument()

    const voiceControls = screen.getByLabelText('Voice controls')
    expect(within(voiceControls).getByText('Voice connected')).toBeInTheDocument()
    expect(within(voiceControls).getByText('Standup')).toBeInTheDocument()
    expect(within(voiceControls).getByRole('button', { name: 'Mute microphone' })).toBeInTheDocument()
    expect(within(voiceControls).getByRole('button', { name: 'Deafen audio' })).toBeInTheDocument()
    expect(within(voiceControls).getByRole('button', { name: 'Disconnect voice' })).toBeInTheDocument()
  })

  it('updates local voice controls and switches voice channels', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Mute microphone' }))
    expect(screen.getByRole('button', { name: 'Unmute microphone' })).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Current voice participants')).getByLabelText('You muted'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Deafen audio' }))
    expect(screen.getByRole('button', { name: 'Undeafen audio' })).toBeInTheDocument()
    expect(
      within(screen.getByLabelText('Current voice participants')).getByLabelText('You deafened'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Join Voice: Office Hours' }))
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Office Hours')
    expect(
      within(screen.getByLabelText('Current voice participants')).getByLabelText('You deafened'),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect voice' }))
    expect(screen.getByLabelText('Voice controls')).toHaveTextContent('Not connected')
    expect(screen.getByRole('button', { name: 'Join Voice: Standup' })).toBeInTheDocument()
  })

  it('keeps screen sharing disabled without an active media session', async () => {
    const screenShare = stubScreenShare({})
    render(<App />)

    expect(screen.getByRole('button', { name: 'Share screen' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Share screen' }))

    expect(screen.getByRole('button', { name: 'Share screen' })).toBeInTheDocument()
    expect(screenShare.getDisplayMedia).not.toHaveBeenCalled()
    expect(mediaMocks.lastVoiceSession?.publishScreenShare).not.toHaveBeenCalled()
  })

  it('adds, switches, removes, and persists multiple server connections', async () => {
    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch to Local OpenCord' })).toBeInTheDocument()
    })

    await userEvent.clear(screen.getByLabelText('Server display name'))
    await userEvent.type(screen.getByLabelText('Server display name'), 'Company Chat')
    await userEvent.clear(screen.getByLabelText('Server URL'))
    await userEvent.type(screen.getByLabelText('Server URL'), 'https://chat.company.com')
    await userEvent.click(screen.getByRole('button', { name: 'Add server' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Switch to Company Chat' })).toBeInTheDocument()
    })
    expect(screen.getAllByText('https://chat.company.com')).not.toHaveLength(0)
    expect(screen.getByText('Realtime ready')).toHaveAttribute(
      'data-realtime-url',
      'wss://chat.company.com/ws',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Switch to Local OpenCord' }))
    expect(screen.getByText('Realtime ready')).toHaveAttribute(
      'data-realtime-url',
      'ws://localhost:8080/ws',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove Company Chat' }))
    expect(screen.queryByRole('button', { name: 'Switch to Company Chat' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('opencord.serverConnections:v1')).toContain(
      'Local OpenCord',
    )
  })
})

function stubScreenShare({
  error,
  track,
}: {
  error?: Error
  track?: MediaStreamTrack
}) {
  const getDisplayMedia = vi.fn()
  if (error) {
    getDisplayMedia.mockRejectedValue(error)
  } else {
    const mediaTrack = track ?? createScreenShareTrack()
    getDisplayMedia.mockResolvedValue({
      getTracks: () => [mediaTrack],
      getVideoTracks: () => [mediaTrack],
    } as unknown as MediaStream)
  }

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia },
  })

  return { getDisplayMedia }
}

function createScreenShareTrack({
  onEnded,
  stop = vi.fn(),
}: {
  onEnded?: (listener: () => void) => void
  stop?: () => void
} = {}) {
  return {
    addEventListener(event: string, listener: EventListenerOrEventListenerObject) {
      if (event === 'ended' && typeof listener === 'function') {
        onEnded?.(() => listener(new Event('ended')))
      }
    },
    kind: 'video',
    stop,
  } as unknown as MediaStreamTrack
}

class TestRealtimeSocket {
  readonly url: string
  readyState = 1
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    queueMicrotask(() => this.onopen?.())
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  emit(event: unknown) {
    this.onmessage?.({ data: JSON.stringify(event) })
  }
}

function createMockVoiceSession() {
  let localScreenSharePublications: Array<{
    kind: string
    muted: boolean
    sid: string
    source: string
  }> = []

  return {
    roomName: 'opencord_voice_test',
    participantIdentity: 'test-user',
    disconnect: vi.fn(),
    publishScreenShare: vi.fn(async () => {
      localScreenSharePublications = [
        {
          sid: 'TR_screen_test',
          kind: 'video',
          source: 'screen_share',
          muted: false,
        },
      ]
    }),
    setMuted: vi.fn(),
    setDeafened: vi.fn(),
    stopScreenShare: vi.fn(async () => {
      localScreenSharePublications = []
    }),
    snapshot: vi.fn(() => ({
      status: 'connected',
      roomName: 'opencord_voice_test',
      participantIdentity: 'test-user',
      localAudioPublications: [],
      localScreenSharePublications,
      remoteParticipants: [],
    })),
  }
}
