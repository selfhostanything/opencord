export const OPEN_SOCKET_STATE = 1
export const INITIAL_REALTIME_STATUS: RealtimeConnectionStatus = 'idle'

export type RealtimeConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

export type RealtimeScope = {
  space_id: string | null
  channel_id: string | null
}

export type RealtimeEventEnvelope = {
  id: string
  type: string
  organization_id: string
  scope: RealtimeScope
  occurred_at: string
  data: unknown
}

export type RealtimeErrorEnvelope = {
  type: 'error'
  error: {
    code: string
  }
}

export type RealtimePongEnvelope = {
  type: 'pong'
}

export type RealtimeIncomingEnvelope =
  | RealtimeEventEnvelope
  | RealtimeErrorEnvelope
  | RealtimePongEnvelope

export type RealtimeClientMessage =
  | { type: 'ping' }
  | { type: 'typing.start'; channel_id: string }
  | { type: 'typing.stop'; channel_id: string }

export type RealtimeSocket = {
  readyState: number
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export type RealtimeWebSocketConstructor = new (url: string) => RealtimeSocket

export type OpenCordRealtimeClientOptions = {
  serverUrl: string
  token?: string
  WebSocket?: RealtimeWebSocketConstructor
}

type EventListener = (event: RealtimeIncomingEnvelope) => void
type StatusListener = (status: RealtimeConnectionStatus) => void

export class OpenCordRealtimeClient {
  readonly url: string

  private readonly WebSocketImpl: RealtimeWebSocketConstructor
  private readonly eventListeners = new Set<EventListener>()
  private readonly statusListeners = new Set<StatusListener>()
  private socket: RealtimeSocket | null = null
  private currentStatus: RealtimeConnectionStatus = INITIAL_REALTIME_STATUS

  constructor(options: OpenCordRealtimeClientOptions) {
    this.url = realtimeUrlForServer(options.serverUrl, options.token)
    this.WebSocketImpl = options.WebSocket ?? defaultWebSocket()
  }

  get status() {
    return this.currentStatus
  }

  connect() {
    if (this.currentStatus === 'connecting' || this.currentStatus === 'open') {
      return
    }

    const socket = new this.WebSocketImpl(this.url)
    this.socket = socket
    this.setStatus('connecting')

    socket.onopen = () => {
      this.setStatus('open')
    }
    socket.onmessage = (event) => {
      this.handleMessage(event.data)
    }
    socket.onerror = () => {
      this.setStatus('error')
    }
    socket.onclose = () => {
      this.socket = null
      this.setStatus('closed')
    }
  }

  disconnect() {
    this.socket?.close()
    this.socket = null
  }

  sendPing() {
    return this.send({ type: 'ping' })
  }

  sendTypingStart(channelId: string) {
    return this.send({ type: 'typing.start', channel_id: channelId })
  }

  sendTypingStop(channelId: string) {
    return this.send({ type: 'typing.stop', channel_id: channelId })
  }

  send(message: RealtimeClientMessage) {
    if (this.socket?.readyState !== OPEN_SOCKET_STATE) {
      return false
    }

    this.socket.send(JSON.stringify(message))
    return true
  }

  onEvent(listener: EventListener) {
    this.eventListeners.add(listener)
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  onStatus(listener: StatusListener) {
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  private handleMessage(data: string) {
    try {
      const event = JSON.parse(data) as RealtimeIncomingEnvelope
      for (const listener of this.eventListeners) {
        listener(event)
      }
    } catch {
      // Ignore malformed gateway data. The server also sends typed error envelopes.
    }
  }

  private setStatus(status: RealtimeConnectionStatus) {
    this.currentStatus = status
    for (const listener of this.statusListeners) {
      listener(status)
    }
  }
}

export function createOpenCordRealtimeClient(options: OpenCordRealtimeClientOptions) {
  return new OpenCordRealtimeClient(options)
}

export function realtimeUrlForServer(serverUrl: string, token?: string) {
  const trimmed = serverUrl.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new TypeError('OpenCord realtime URL is required')
  }

  const url = new URL(trimmed)
  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  } else if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new TypeError(`Unsupported realtime URL protocol: ${url.protocol}`)
  }

  if (!url.pathname || url.pathname === '/') {
    url.pathname = '/ws'
  } else if (!url.pathname.endsWith('/ws')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws`
  }

  if (token) {
    url.searchParams.set('token', token)
  }

  return url.toString()
}

function defaultWebSocket() {
  if (typeof WebSocket === 'undefined') {
    throw new TypeError('WebSocket is not available in this runtime')
  }

  return WebSocket as unknown as RealtimeWebSocketConstructor
}
