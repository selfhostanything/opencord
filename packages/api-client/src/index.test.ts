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
})
