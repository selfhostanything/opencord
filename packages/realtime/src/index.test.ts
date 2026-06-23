import { describe, expect, it } from 'vitest'

import {
  OPEN_SOCKET_STATE,
  createOpenCordRealtimeClient,
  realtimeUrlForServer,
  type RealtimeConnectionStatus,
  type RealtimeSocket,
} from './index'

class FakeSocket implements RealtimeSocket {
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(readonly url: string) {}

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  open() {
    this.readyState = OPEN_SOCKET_STATE
    this.onopen?.()
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  fail() {
    this.onerror?.()
  }
}

function socketFactory(sockets: FakeSocket[]) {
  return class TestSocket extends FakeSocket {
    constructor(url: string) {
      super(url)
      sockets.push(this)
    }
  }
}

describe('OpenCord realtime client', () => {
  it('builds websocket URLs for self-hosted and cloud servers', () => {
    expect(realtimeUrlForServer('http://localhost:8080', 'session token')).toBe(
      'ws://localhost:8080/ws?token=session+token',
    )
    expect(realtimeUrlForServer('https://chat.example.com///', 'tok/en')).toBe(
      'wss://chat.example.com/ws?token=tok%2Fen',
    )
    expect(realtimeUrlForServer('wss://edge.example.com/ws', undefined)).toBe(
      'wss://edge.example.com/ws',
    )
    expect(() => realtimeUrlForServer('   ', 'token')).toThrow('OpenCord realtime URL is required')
  })

  it('opens a socket and emits status transitions', () => {
    const sockets: FakeSocket[] = []
    const statuses: RealtimeConnectionStatus[] = []
    const client = createOpenCordRealtimeClient({
      serverUrl: 'https://chat.example.com',
      token: 'session-token',
      WebSocket: socketFactory(sockets),
    })
    client.onStatus((status) => statuses.push(status))

    client.connect()
    expect(sockets).toHaveLength(1)
    expect(sockets[0].url).toBe('wss://chat.example.com/ws?token=session-token')
    expect(statuses).toEqual(['connecting'])

    sockets[0].open()
    expect(statuses).toEqual(['connecting', 'open'])

    sockets[0].close()
    expect(statuses).toEqual(['connecting', 'open', 'closed'])
  })

  it('sends ping and typing client messages only when the socket is open', () => {
    const sockets: FakeSocket[] = []
    const client = createOpenCordRealtimeClient({
      serverUrl: 'http://localhost:8080',
      token: 'session-token',
      WebSocket: socketFactory(sockets),
    })

    client.connect()
    expect(client.sendPing()).toBe(false)

    sockets[0].open()
    expect(client.sendPing()).toBe(true)
    expect(client.sendTypingStart('channel-1')).toBe(true)
    expect(client.sendTypingStop('channel-1')).toBe(true)
    expect(sockets[0].sent.map((message) => JSON.parse(message))).toEqual([
      { type: 'ping' },
      { type: 'typing.start', channel_id: 'channel-1' },
      { type: 'typing.stop', channel_id: 'channel-1' },
    ])
  })

  it('emits parsed server envelopes and supports listener unsubscribe', () => {
    const sockets: FakeSocket[] = []
    const events: unknown[] = []
    const client = createOpenCordRealtimeClient({
      serverUrl: 'http://localhost:8080',
      token: 'session-token',
      WebSocket: socketFactory(sockets),
    })
    const unsubscribe = client.onEvent((event) => events.push(event))

    client.connect()
    sockets[0].open()
    sockets[0].receive({
      id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc96',
      type: 'typing.started',
      organization_id: 'org-1',
      scope: { space_id: 'space-1', channel_id: 'channel-1' },
      occurred_at: '2026-06-23T02:00:00.000Z',
      data: { user_id: 'user-1' },
    })
    unsubscribe()
    sockets[0].receive({ type: 'pong' })

    expect(events).toEqual([
      {
        id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc96',
        type: 'typing.started',
        organization_id: 'org-1',
        scope: { space_id: 'space-1', channel_id: 'channel-1' },
        occurred_at: '2026-06-23T02:00:00.000Z',
        data: { user_id: 'user-1' },
      },
    ])
  })
})
