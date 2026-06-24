import { describe, expect, it, vi } from 'vitest'

import type { paths } from './generated/openapi'
import {
  DEFAULT_OPENCORD_SERVER_URL,
  OpenCordApiError,
  createOpenCordApiClient,
  normalizeOpenCordBaseUrl,
} from './index'

const requiredOpenApiPaths = [
  '/healthz',
  '/.well-known/opencord',
  '/auth/login',
  '/push-tokens',
  '/voice/channels/{channel_id}/join',
  '/join/{join_slug}',
  '/organizations/{organization_id}/bot-applications',
  '/channels/{channel_id}/webhooks',
] as const satisfies readonly (keyof paths)[]

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: init?.status ?? 200,
    statusText: init?.statusText,
  })
}

describe('OpenCord API client', () => {
  it('keeps generated OpenAPI path types at the package boundary', () => {
    expect(requiredOpenApiPaths).toContain('/healthz')
    expect(requiredOpenApiPaths).toContain('/auth/login')
    expect(requiredOpenApiPaths).toContain('/channels/{channel_id}/webhooks')
  })

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

  it('drives the local alpha auth organization space channel and message API path', async () => {
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            user: {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc90',
              email: 'alpha@example.com',
              display_name: 'Alpha User',
            },
            session: { token: 'session-token' },
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          organization: {
            id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
            name: 'Alpha Org',
            slug: 'alpha-org',
            plan: 'free',
            deployment_mode: 'self_hosted',
            primary_region: 'local',
            created_at: '2026-06-24T00:00:00Z',
            role: 'owner',
          },
          membership: { role: 'owner', status: 'active' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          spaces: [
            {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc92',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
              name: 'Alpha Space',
              slug: 'alpha-space',
              created_at: '2026-06-24T00:01:00Z',
              role: 'owner',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          space: {
            id: '01973f83-f22a-73ba-ae76-5a045c52fc92',
            organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
            name: 'Alpha Space',
            slug: 'alpha-space',
            created_at: '2026-06-24T00:01:00Z',
          },
          membership: { role: 'owner', status: 'active' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          channel: {
            id: '01973f83-f22a-73ba-ae76-5a045c52fc93',
            organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
            space_id: '01973f83-f22a-73ba-ae76-5a045c52fc92',
            kind: 'text',
            name: 'general',
            slug: 'general',
            topic: 'Local alpha chat',
            position: 0,
            is_private: false,
            archived_at: null,
            created_at: '2026-06-24T00:02:00Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          messages: [
            {
              id: '01973f83-f22a-73ba-ae76-5a045c52fc94',
              organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
              channel_id: '01973f83-f22a-73ba-ae76-5a045c52fc93',
              author_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc90',
              content: 'hello from local alpha',
              content_format: 'plain',
              created_at: '2026-06-24T00:03:00Z',
              edited_at: null,
              deleted_at: null,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            id: '01973f83-f22a-73ba-ae76-5a045c52fc95',
            organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
            channel_id: '01973f83-f22a-73ba-ae76-5a045c52fc93',
            author_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc90',
            content: 'sent from the real API path',
            content_format: 'plain',
            created_at: '2026-06-24T00:04:00Z',
            edited_at: null,
            deleted_at: null,
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const anonymousClient = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
    })

    const registered = await anonymousClient.register({
      email: 'alpha@example.com',
      displayName: 'Alpha User',
      password: 'correct horse battery staple',
    })
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: registered.session.token,
    })

    await expect(client.createOrganization({ name: 'Alpha Org' })).resolves.toMatchObject({
      organization: { id: '01973f83-f22a-73ba-ae76-5a045c52fc91', name: 'Alpha Org' },
      membership: { role: 'owner' },
    })
    await expect(client.listSpaces('01973f83-f22a-73ba-ae76-5a045c52fc91')).resolves.toEqual([
      expect.objectContaining({ id: '01973f83-f22a-73ba-ae76-5a045c52fc92' }),
    ])
    await expect(
      client.createSpace('01973f83-f22a-73ba-ae76-5a045c52fc91', { name: 'Alpha Space' }),
    ).resolves.toMatchObject({
      space: { id: '01973f83-f22a-73ba-ae76-5a045c52fc92', name: 'Alpha Space' },
      membership: { role: 'owner' },
    })
    await expect(
      client.createChannel('01973f83-f22a-73ba-ae76-5a045c52fc92', {
        name: 'general',
        topic: 'Local alpha chat',
      }),
    ).resolves.toMatchObject({ id: '01973f83-f22a-73ba-ae76-5a045c52fc93', kind: 'text' })
    await expect(client.listMessages('01973f83-f22a-73ba-ae76-5a045c52fc93')).resolves.toEqual([
      expect.objectContaining({ content: 'hello from local alpha' }),
    ])
    await expect(
      client.createMessage('01973f83-f22a-73ba-ae76-5a045c52fc93', {
        content: 'sent from the real API path',
      }),
    ).resolves.toMatchObject({
      id: '01973f83-f22a-73ba-ae76-5a045c52fc95',
      content: 'sent from the real API path',
    })
    await expect(client.deleteMessage('01973f83-f22a-73ba-ae76-5a045c52fc95')).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://chat.example.com/auth/register', {
      body: JSON.stringify({
        email: 'alpha@example.com',
        display_name: 'Alpha User',
        password: 'correct horse battery staple',
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://chat.example.com/organizations',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
        method: 'POST',
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      8,
      'https://chat.example.com/messages/01973f83-f22a-73ba-ae76-5a045c52fc95',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('discovers OIDC providers and completes signed OIDC login', async () => {
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        jsonResponse({
          providers: [
            {
              organization_id: '019ef32c-6cee-7933-9a6e-8d3e6f45905e',
              issuer: 'https://idp.company.example',
              authorization_endpoint: 'https://idp.company.example/oauth2/authorize',
              token_endpoint: 'https://idp.company.example/oauth2/token',
              jwks_uri: 'https://idp.company.example/oauth2/jwks',
              client_id: 'opencord',
              allowed_domains: ['company.example'],
              require_sso: true,
              auto_join_role: 'member',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          user: {
            id: '019ef32c-6cee-7933-9a6e-8d3e6f45905f',
            email: 'member@company.example',
            display_name: 'Member User',
          },
          session: {
            token: 'session-token',
          },
        }),
      )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
    })

    await expect(client.oidcProvidersForEmail('member@company.example')).resolves.toEqual([
      {
        organizationId: '019ef32c-6cee-7933-9a6e-8d3e6f45905e',
        issuer: 'https://idp.company.example',
        authorizationEndpoint: 'https://idp.company.example/oauth2/authorize',
        tokenEndpoint: 'https://idp.company.example/oauth2/token',
        jwksUri: 'https://idp.company.example/oauth2/jwks',
        clientId: 'opencord',
        allowedDomains: ['company.example'],
        requireSso: true,
        autoJoinRole: 'member',
      },
    ])
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://chat.example.com/auth/oidc/providers?email=member%40company.example',
      {
        headers: { Accept: 'application/json' },
      },
    )

    await expect(
      client.completeOidcLogin({
        issuer: 'https://idp.company.example',
        subject: 'idp-user-1',
        email: 'member@company.example',
        displayName: 'Member User',
        emailVerified: true,
        signature: 'signed-provider-assertion',
      }),
    ).resolves.toEqual({
      user: {
        id: '019ef32c-6cee-7933-9a6e-8d3e6f45905f',
        email: 'member@company.example',
        displayName: 'Member User',
      },
      session: {
        token: 'session-token',
      },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'https://chat.example.com/auth/oidc/callback', {
      body: JSON.stringify({
        issuer: 'https://idp.company.example',
        subject: 'idp-user-1',
        email: 'member@company.example',
        display_name: 'Member User',
        email_verified: true,
        signature: 'signed-provider-assertion',
      }),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
  })

  it('preserves rich message fields from the server payload', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        messages: [
          {
            id: '01973f83-f22a-73ba-ae76-5a045c52fc94',
            organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
            space_id: '01973f83-f22a-73ba-ae76-5a045c52fc92',
            channel_id: '01973f83-f22a-73ba-ae76-5a045c52fc93',
            author_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc90',
            content: 'seeded rich message',
            content_format: 'plain',
            embeds: [
              {
                type: 'rich',
                title: 'Seeded Embed',
                description: 'Rendered by the official client',
                color: 3726513,
              },
            ],
            components: [
              {
                type: 1,
                components: [{ type: 2, label: 'Acknowledge', custom_id: 'seed:ack' }],
              },
            ],
            mention_user_ids: ['01973f83-f22a-73ba-ae76-5a045c52fc90'],
            mention_role_ids: ['01973f83-f22a-73ba-ae76-5a045c52fc99'],
            mention_everyone: true,
            reply_to_message_id: '01973f83-f22a-73ba-ae76-5a045c52fc88',
            webhook_username: 'Seed Hook',
            webhook_avatar_url: 'https://chat.example.com/hook.png',
            attachments: [
              {
                id: '01973f83-f22a-73ba-ae76-5a045c52fc95',
                organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc91',
                space_id: '01973f83-f22a-73ba-ae76-5a045c52fc92',
                channel_id: '01973f83-f22a-73ba-ae76-5a045c52fc93',
                message_id: '01973f83-f22a-73ba-ae76-5a045c52fc94',
                uploader_user_id: '01973f83-f22a-73ba-ae76-5a045c52fc90',
                file_name: 'local-alpha-readme.txt',
                content_type: 'text/plain',
                size_bytes: 87,
                status: 'linked',
                download_url:
                  'https://chat.example.com/attachments/01973f83-f22a-73ba-ae76-5a045c52fc95/content',
              },
            ],
            created_at: '2026-06-24T00:03:00Z',
            edited_at: null,
            deleted_at: null,
          },
        ],
      }),
    )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    const [message] = await client.listMessages('01973f83-f22a-73ba-ae76-5a045c52fc93')

    expect(message.spaceId).toBe('01973f83-f22a-73ba-ae76-5a045c52fc92')
    expect(message.embeds).toEqual([
      expect.objectContaining({
        title: 'Seeded Embed',
        description: 'Rendered by the official client',
      }),
    ])
    expect(message.components).toHaveLength(1)
    expect(message.mentionUserIds).toEqual(['01973f83-f22a-73ba-ae76-5a045c52fc90'])
    expect(message.mentionRoleIds).toEqual(['01973f83-f22a-73ba-ae76-5a045c52fc99'])
    expect(message.mentionEveryone).toBe(true)
    expect(message.replyToMessageId).toBe('01973f83-f22a-73ba-ae76-5a045c52fc88')
    expect(message.webhookUsername).toBe('Seed Hook')
    expect(message.webhookAvatarUrl).toBe('https://chat.example.com/hook.png')
    expect(message.attachments).toEqual([
      expect.objectContaining({
        fileName: 'local-alpha-readme.txt',
        contentType: 'text/plain',
        sizeBytes: 87,
        downloadUrl:
          'https://chat.example.com/attachments/01973f83-f22a-73ba-ae76-5a045c52fc95/content',
      }),
    ])
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
        meetingId: null,
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

  it('creates a channel command interaction with bearer auth', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        interaction: {
          id: '01973f83-f22a-73ba-ae76-5a045c52fca4',
          application_id: '01973f83-f22a-73ba-ae76-5a045c52fca5',
          space_id: '01973f83-f22a-73ba-ae76-5a045c52fca6',
          channel_id: '01973f83-f22a-73ba-ae76-5a045c52fca7',
          command_id: '01973f83-f22a-73ba-ae76-5a045c52fca8',
          invoking_user_id: '01973f83-f22a-73ba-ae76-5a045c52fca9',
          token: 'oci_shown_once',
          token_last_four: 'once',
          status: 'pending',
          options: [{ name: 'version', value: '1.2.3' }],
          created_at: '2026-06-23T09:00:00.000Z',
          responded_at: null,
        },
      }),
    )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(
      client.createCommandInteraction('01973f83-f22a-73ba-ae76-5a045c52fca7', {
        commandId: '01973f83-f22a-73ba-ae76-5a045c52fca8',
        options: [{ name: 'version', value: '1.2.3' }],
      }),
    ).resolves.toEqual({
      id: '01973f83-f22a-73ba-ae76-5a045c52fca4',
      applicationId: '01973f83-f22a-73ba-ae76-5a045c52fca5',
      spaceId: '01973f83-f22a-73ba-ae76-5a045c52fca6',
      channelId: '01973f83-f22a-73ba-ae76-5a045c52fca7',
      commandId: '01973f83-f22a-73ba-ae76-5a045c52fca8',
      invokingUserId: '01973f83-f22a-73ba-ae76-5a045c52fca9',
      token: 'oci_shown_once',
      tokenLastFour: 'once',
      status: 'pending',
      options: [{ name: 'version', value: '1.2.3' }],
      createdAt: '2026-06-23T09:00:00.000Z',
      respondedAt: null,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/channels/01973f83-f22a-73ba-ae76-5a045c52fca7/command-interactions',
      {
        body: JSON.stringify({
          command_id: '01973f83-f22a-73ba-ae76-5a045c52fca8',
          options: [{ name: 'version', value: '1.2.3' }],
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

  it('creates a bot application with bearer auth and maps shown-once token', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        bot_application: {
          id: '01973f83-f22a-73ba-ae76-5a045c52fcb1',
          organization_id: '01973f83-f22a-73ba-ae76-5a045c52fcb2',
          bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fcb3',
          created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fcb4',
          name: 'Deploy Bot',
          description: 'Posts release status',
          status: 'active',
        },
        bot_token: {
          id: '01973f83-f22a-73ba-ae76-5a045c52fcb5',
          application_id: '01973f83-f22a-73ba-ae76-5a045c52fcb1',
          token: 'ocb_shown_once',
          token_last_four: 'once',
        },
      }),
    )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(
      client.createBotApplication('01973f83-f22a-73ba-ae76-5a045c52fcb2', {
        name: 'Deploy Bot',
        description: 'Posts release status',
      }),
    ).resolves.toEqual({
      botApplication: {
        id: '01973f83-f22a-73ba-ae76-5a045c52fcb1',
        organizationId: '01973f83-f22a-73ba-ae76-5a045c52fcb2',
        botUserId: '01973f83-f22a-73ba-ae76-5a045c52fcb3',
        createdByUserId: '01973f83-f22a-73ba-ae76-5a045c52fcb4',
        name: 'Deploy Bot',
        description: 'Posts release status',
        status: 'active',
      },
      botToken: {
        id: '01973f83-f22a-73ba-ae76-5a045c52fcb5',
        applicationId: '01973f83-f22a-73ba-ae76-5a045c52fcb1',
        token: 'ocb_shown_once',
        tokenLastFour: 'once',
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/organizations/01973f83-f22a-73ba-ae76-5a045c52fcb2/bot-applications',
      {
        body: JSON.stringify({
          name: 'Deploy Bot',
          description: 'Posts release status',
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

  it('rotates a bot token and invites a bot application to a space', async () => {
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        jsonResponse({
          bot_token: {
            id: '01973f83-f22a-73ba-ae76-5a045c52fcc1',
            application_id: '01973f83-f22a-73ba-ae76-5a045c52fcc2',
            token: 'ocb_rotated_once',
            token_last_four: 'once',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          bot_application: {
            id: '01973f83-f22a-73ba-ae76-5a045c52fcc2',
            organization_id: '01973f83-f22a-73ba-ae76-5a045c52fcc3',
            bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fcc4',
            created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fcc5',
            name: 'Deploy Bot',
            description: null,
            status: 'active',
          },
          member: {
            space_id: '01973f83-f22a-73ba-ae76-5a045c52fcc6',
            user_id: '01973f83-f22a-73ba-ae76-5a045c52fcc4',
            role: 'member',
            status: 'active',
          },
        }),
      )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(
      client.rotateBotToken(
        '01973f83-f22a-73ba-ae76-5a045c52fcc3',
        '01973f83-f22a-73ba-ae76-5a045c52fcc2',
      ),
    ).resolves.toEqual({
      id: '01973f83-f22a-73ba-ae76-5a045c52fcc1',
      applicationId: '01973f83-f22a-73ba-ae76-5a045c52fcc2',
      token: 'ocb_rotated_once',
      tokenLastFour: 'once',
    })
    await expect(
      client.inviteBotApplicationToSpace(
        '01973f83-f22a-73ba-ae76-5a045c52fcc3',
        '01973f83-f22a-73ba-ae76-5a045c52fcc2',
        '01973f83-f22a-73ba-ae76-5a045c52fcc6',
        { role: 'member' },
      ),
    ).resolves.toEqual({
      botApplication: {
        id: '01973f83-f22a-73ba-ae76-5a045c52fcc2',
        organizationId: '01973f83-f22a-73ba-ae76-5a045c52fcc3',
        botUserId: '01973f83-f22a-73ba-ae76-5a045c52fcc4',
        createdByUserId: '01973f83-f22a-73ba-ae76-5a045c52fcc5',
        name: 'Deploy Bot',
        description: null,
        status: 'active',
      },
      member: {
        spaceId: '01973f83-f22a-73ba-ae76-5a045c52fcc6',
        userId: '01973f83-f22a-73ba-ae76-5a045c52fcc4',
        role: 'member',
        status: 'active',
      },
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://chat.example.com/organizations/01973f83-f22a-73ba-ae76-5a045c52fcc3/bot-applications/01973f83-f22a-73ba-ae76-5a045c52fcc2/tokens/rotate',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
        },
        method: 'POST',
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://chat.example.com/organizations/01973f83-f22a-73ba-ae76-5a045c52fcc3/bot-applications/01973f83-f22a-73ba-ae76-5a045c52fcc2/spaces/01973f83-f22a-73ba-ae76-5a045c52fcc6/invite',
      {
        body: JSON.stringify({ role: 'member' }),
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    )
  })

  it('lists and gets bot application details without raw tokens', async () => {
    const botDetailPayload = {
      bot_application: {
        id: '01973f83-f22a-73ba-ae76-5a045c52fcd1',
        organization_id: '01973f83-f22a-73ba-ae76-5a045c52fcd2',
        bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fcd3',
        created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fcd4',
        name: 'Deploy Bot',
        description: 'Posts release status',
        status: 'active',
      },
      active_token_last_four: 'last',
      space_memberships: [
        {
          space_id: '01973f83-f22a-73ba-ae76-5a045c52fcd5',
          user_id: '01973f83-f22a-73ba-ae76-5a045c52fcd3',
          role: 'member',
          status: 'active',
        },
      ],
    }
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        jsonResponse({
          bot_applications: [botDetailPayload],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(botDetailPayload))
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    const expected = {
      botApplication: {
        id: '01973f83-f22a-73ba-ae76-5a045c52fcd1',
        organizationId: '01973f83-f22a-73ba-ae76-5a045c52fcd2',
        botUserId: '01973f83-f22a-73ba-ae76-5a045c52fcd3',
        createdByUserId: '01973f83-f22a-73ba-ae76-5a045c52fcd4',
        name: 'Deploy Bot',
        description: 'Posts release status',
        status: 'active',
      },
      activeTokenLastFour: 'last',
      spaceMemberships: [
        {
          spaceId: '01973f83-f22a-73ba-ae76-5a045c52fcd5',
          userId: '01973f83-f22a-73ba-ae76-5a045c52fcd3',
          role: 'member',
          status: 'active',
        },
      ],
    }

    await expect(
      client.listBotApplications('01973f83-f22a-73ba-ae76-5a045c52fcd2'),
    ).resolves.toEqual([expected])
    await expect(
      client.getBotApplication(
        '01973f83-f22a-73ba-ae76-5a045c52fcd2',
        '01973f83-f22a-73ba-ae76-5a045c52fcd1',
      ),
    ).resolves.toEqual(expected)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://chat.example.com/organizations/01973f83-f22a-73ba-ae76-5a045c52fcd2/bot-applications',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
        },
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://chat.example.com/organizations/01973f83-f22a-73ba-ae76-5a045c52fcd2/bot-applications/01973f83-f22a-73ba-ae76-5a045c52fcd1',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
        },
      },
    )
  })

  it('manages incoming webhooks without exposing list tokens', async () => {
    const webhookPayload = {
      id: '01973f83-f22a-73ba-ae76-5a045c52fce1',
      organization_id: '01973f83-f22a-73ba-ae76-5a045c52fce2',
      space_id: '01973f83-f22a-73ba-ae76-5a045c52fce3',
      channel_id: '01973f83-f22a-73ba-ae76-5a045c52fce4',
      bot_user_id: '01973f83-f22a-73ba-ae76-5a045c52fce5',
      created_by_user_id: '01973f83-f22a-73ba-ae76-5a045c52fce6',
      name: 'Release Hook',
      status: 'active',
      token_last_four: 'once',
      created_at: '2026-06-23T09:00:00.000Z',
    }
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(
        jsonResponse({
          webhook: {
            ...webhookPayload,
            token: 'ocw_shown_once',
            execute_url:
              'https://chat.example.com/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_shown_once',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          webhooks: [webhookPayload],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          webhook: {
            ...webhookPayload,
            token: 'ocw_rotated_once',
            token_last_four: 'once',
            execute_url:
              'https://chat.example.com/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_rotated_once',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    const expectedWebhook = {
      id: '01973f83-f22a-73ba-ae76-5a045c52fce1',
      organizationId: '01973f83-f22a-73ba-ae76-5a045c52fce2',
      spaceId: '01973f83-f22a-73ba-ae76-5a045c52fce3',
      channelId: '01973f83-f22a-73ba-ae76-5a045c52fce4',
      botUserId: '01973f83-f22a-73ba-ae76-5a045c52fce5',
      createdByUserId: '01973f83-f22a-73ba-ae76-5a045c52fce6',
      name: 'Release Hook',
      status: 'active',
      tokenLastFour: 'once',
      createdAt: '2026-06-23T09:00:00.000Z',
    }

    await expect(
      client.createIncomingWebhook('01973f83-f22a-73ba-ae76-5a045c52fce4', {
        name: 'Release Hook',
      }),
    ).resolves.toEqual({
      ...expectedWebhook,
      token: 'ocw_shown_once',
      executeUrl:
        'https://chat.example.com/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_shown_once',
    })
    await expect(
      client.listIncomingWebhooks('01973f83-f22a-73ba-ae76-5a045c52fce4'),
    ).resolves.toEqual([expectedWebhook])
    await expect(
      client.rotateIncomingWebhookToken(
        '01973f83-f22a-73ba-ae76-5a045c52fce4',
        '01973f83-f22a-73ba-ae76-5a045c52fce1',
      ),
    ).resolves.toEqual({
      ...expectedWebhook,
      token: 'ocw_rotated_once',
      executeUrl:
        'https://chat.example.com/api/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/ocw_rotated_once',
    })
    await expect(
      client.deleteIncomingWebhook(
        '01973f83-f22a-73ba-ae76-5a045c52fce4',
        '01973f83-f22a-73ba-ae76-5a045c52fce1',
      ),
    ).resolves.toBeUndefined()

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://chat.example.com/channels/01973f83-f22a-73ba-ae76-5a045c52fce4/webhooks',
      {
        body: JSON.stringify({ name: 'Release Hook' }),
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        method: 'POST',
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://chat.example.com/channels/01973f83-f22a-73ba-ae76-5a045c52fce4/webhooks',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
        },
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://chat.example.com/channels/01973f83-f22a-73ba-ae76-5a045c52fce4/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1/token/rotate',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
        },
        method: 'POST',
      },
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://chat.example.com/channels/01973f83-f22a-73ba-ae76-5a045c52fce4/webhooks/01973f83-f22a-73ba-ae76-5a045c52fce1',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer session-token',
        },
        method: 'DELETE',
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

  it('creates a meeting media token through the typed API', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
    fetchMock.mockResolvedValue(
      jsonResponse({
        media: {
          provider: 'livekit',
          server_url: 'ws://localhost:7880',
          region: 'local',
          room_type: 'meeting_room',
          room_name: 'opencord_meeting_01973f83f22a73baae765a045c52fca1',
          organization_id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
          space_id: '01973f83-f22a-73ba-ae76-5a045c52fc95',
          channel_id: '01973f83-f22a-73ba-ae76-5a045c52fc98',
          meeting_id: '01973f83-f22a-73ba-ae76-5a045c52fca1',
          participant_identity: '01973f83-f22a-73ba-ae76-5a045c52fc97',
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
    )
    const client = createOpenCordApiClient({
      baseUrl: 'https://chat.example.com',
      fetch: fetchMock,
      sessionToken: 'session-token',
    })

    await expect(
      client.createMeetingMediaToken('01973f83-f22a-73ba-ae76-5a045c52fca1', {
        canPublishAudio: true,
        canPublishVideo: true,
        canPublishScreen: true,
        canSubscribe: true,
      }),
    ).resolves.toEqual({
      provider: 'livekit',
      serverUrl: 'ws://localhost:7880',
      region: 'local',
      roomType: 'meeting_room',
      roomName: 'opencord_meeting_01973f83f22a73baae765a045c52fca1',
      organizationId: '01973f83-f22a-73ba-ae76-5a045c52fc96',
      spaceId: '01973f83-f22a-73ba-ae76-5a045c52fc95',
      channelId: '01973f83-f22a-73ba-ae76-5a045c52fc98',
      meetingId: '01973f83-f22a-73ba-ae76-5a045c52fca1',
      participantIdentity: '01973f83-f22a-73ba-ae76-5a045c52fc97',
      participantToken: 'meeting.livekit.jwt',
      expiresAt: '2026-06-24T00:10:00Z',
      grants: {
        canPublishAudio: true,
        canPublishVideo: true,
        canPublishScreen: true,
        canSubscribe: true,
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://chat.example.com/meetings/01973f83-f22a-73ba-ae76-5a045c52fca1/media/token',
      {
        body: JSON.stringify({
          can_publish_audio: true,
          can_publish_video: true,
          can_publish_screen: true,
          can_subscribe: true,
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
})
