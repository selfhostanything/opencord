export const DEFAULT_OPENCORD_SERVER_URL = 'http://localhost:8080'

export type OpenCordFetch = (input: string, init?: RequestInit) => Promise<Response>

export type ServerHealth =
  | { status: 'online'; version: string }
  | { status: 'offline'; message: string }

export type WellKnownResponse = {
  server: string
  version: string
  apiBaseUrl: string
  realtimeUrl: string
}

export type ServerDiscovery = {
  wellKnown: WellKnownResponse
  version: string
  capabilities: string[]
}

export type OpenCordApiClientOptions = {
  baseUrl?: string
  fetch?: OpenCordFetch
}

type WellKnownPayload = {
  server?: unknown
  version?: unknown
  api_base_url?: unknown
  realtime_url?: unknown
}

type VersionPayload = {
  version?: unknown
}

type CapabilitiesPayload = {
  capabilities?: unknown
}

type ErrorPayload = {
  error?: {
    message?: unknown
  }
}

const jsonHeaders = { Accept: 'application/json' }

export class OpenCordApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'OpenCordApiError'
    this.status = status
    this.body = body
  }
}

export class OpenCordApiClient {
  readonly baseUrl: string

  private readonly fetchImpl: OpenCordFetch

  constructor(options: OpenCordApiClientOptions = {}) {
    this.baseUrl = normalizeOpenCordBaseUrl(options.baseUrl)
    this.fetchImpl = options.fetch ?? defaultFetch
  }

  endpoint(path: string) {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  }

  async health(): Promise<ServerHealth> {
    try {
      const response = await this.fetchImpl(this.endpoint('/healthz'), {
        headers: jsonHeaders,
      })

      if (!response.ok) {
        return { status: 'offline', message: `HTTP ${response.status}` }
      }

      const payload = (await response.json()) as VersionPayload & { status?: unknown }
      if (payload.status !== 'ok') {
        return { status: 'offline', message: 'Health response was not ok' }
      }

      return { status: 'online', version: stringValue(payload.version, 'unknown') }
    } catch (error) {
      return {
        status: 'offline',
        message: error instanceof Error ? error.message : 'Unable to reach server',
      }
    }
  }

  async wellKnown(): Promise<WellKnownResponse> {
    const payload = await this.requestJson<WellKnownPayload>('/.well-known/opencord')

    return {
      server: stringValue(payload.server, 'opencord'),
      version: stringValue(payload.version, 'unknown'),
      apiBaseUrl: stringValue(payload.api_base_url, this.endpoint('/api')),
      realtimeUrl: stringValue(payload.realtime_url, websocketUrl(this.baseUrl)),
    }
  }

  async version(): Promise<string> {
    const payload = await this.requestJson<VersionPayload>('/api/version')
    return stringValue(payload.version, 'unknown')
  }

  async capabilities(): Promise<string[]> {
    const payload = await this.requestJson<CapabilitiesPayload>('/api/capabilities')
    if (!Array.isArray(payload.capabilities)) {
      return []
    }

    return payload.capabilities.filter((capability): capability is string => {
      return typeof capability === 'string'
    })
  }

  async discover(): Promise<ServerDiscovery> {
    const [wellKnown, version, capabilities] = await Promise.all([
      this.wellKnown(),
      this.version(),
      this.capabilities(),
    ])

    return { wellKnown, version, capabilities }
  }

  private async requestJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(this.endpoint(path), {
      headers: jsonHeaders,
    })
    const payload = await parseJson(response)

    if (!response.ok) {
      throw new OpenCordApiError(response.status, errorMessage(payload, response.status), payload)
    }

    return payload as T
  }
}

export function createOpenCordApiClient(options: OpenCordApiClientOptions = {}) {
  return new OpenCordApiClient(options)
}

export function normalizeOpenCordBaseUrl(value = DEFAULT_OPENCORD_SERVER_URL) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new TypeError('OpenCord server URL is required')
  }

  return trimmed
}

async function defaultFetch(input: string, init?: RequestInit) {
  return fetch(input, init)
}

async function parseJson(response: Response) {
  try {
    return (await response.json()) as unknown
  } catch {
    return undefined
  }
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value ? value : fallback
}

function errorMessage(payload: unknown, status: number) {
  const error = payload as ErrorPayload | undefined
  if (typeof error?.error?.message === 'string' && error.error.message) {
    return error.error.message
  }

  return `HTTP ${status}`
}

function websocketUrl(baseUrl: string) {
  if (baseUrl.startsWith('https://')) {
    return `wss://${baseUrl.slice('https://'.length)}/ws`
  }

  if (baseUrl.startsWith('http://')) {
    return `ws://${baseUrl.slice('http://'.length)}/ws`
  }

  return `${baseUrl}/ws`
}
