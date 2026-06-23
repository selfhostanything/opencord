export const OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY = 'opencord.serverConnections:v1'

export type ServerConnection = {
  id: string
  displayName: string
  baseUrl: string
  serverVersion: string
  capabilities: string[]
  cacheNamespace: string
  lastConnectedAt: string
}

export type ServerConnectionState = {
  version: 1
  activeConnectionId: string
  connections: ServerConnection[]
}

export type UpsertServerConnectionInput = {
  baseUrl: string
  displayName?: string
  serverVersion?: string
  capabilities?: string[]
  now?: string
}

export type ServerConnectionStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type PersistedServerConnection = {
  id?: unknown
  displayName?: unknown
  baseUrl?: unknown
  serverVersion?: unknown
  capabilities?: unknown
  cacheNamespace?: unknown
  lastConnectedAt?: unknown
}

type PersistedServerConnectionState = {
  version?: unknown
  activeConnectionId?: unknown
  connections?: unknown
}

const DEFAULT_CONNECTION_TIME = '1970-01-01T00:00:00.000Z'
const DEFAULT_SERVER_BASE_URL = 'http://localhost:8080'

export function createDefaultServerConnectionState(now = DEFAULT_CONNECTION_TIME) {
  const connection = serverConnectionFromInput({
    baseUrl: DEFAULT_SERVER_BASE_URL,
    displayName: 'Local OpenCord',
    serverVersion: 'unknown',
    capabilities: [],
    now,
  })

  return {
    version: 1,
    activeConnectionId: connection.id,
    connections: [connection],
  } satisfies ServerConnectionState
}

export function activeServerConnection(state: ServerConnectionState) {
  return (
    state.connections.find((connection) => connection.id === state.activeConnectionId) ??
    state.connections[0] ??
    null
  )
}

export function upsertServerConnection(
  state: ServerConnectionState,
  input: UpsertServerConnectionInput,
) {
  const nextConnection = serverConnectionFromInput(input)
  let matched = false
  const connections = state.connections.map((connection) => {
    if (connection.baseUrl !== nextConnection.baseUrl) {
      return connection
    }

    matched = true
    return {
      ...nextConnection,
      id: connection.id,
      cacheNamespace: connection.cacheNamespace,
    }
  })

  if (!matched) {
    connections.push(nextConnection)
  }

  const activeConnection = matched
    ? connections.find((connection) => connection.baseUrl === nextConnection.baseUrl)
    : nextConnection

  return {
    version: 1,
    activeConnectionId: activeConnection?.id ?? state.activeConnectionId,
    connections,
  } satisfies ServerConnectionState
}

export function switchServerConnection(state: ServerConnectionState, connectionId: string) {
  if (!state.connections.some((connection) => connection.id === connectionId)) {
    return state
  }

  return {
    ...state,
    activeConnectionId: connectionId,
  }
}

export function removeServerConnection(state: ServerConnectionState, connectionId: string) {
  const connections = state.connections.filter((connection) => connection.id !== connectionId)
  if (connections.length === 0) {
    return createDefaultServerConnectionState()
  }

  const activeConnectionId =
    state.activeConnectionId === connectionId ? connections[0].id : state.activeConnectionId

  return {
    version: 1,
    activeConnectionId,
    connections,
  } satisfies ServerConnectionState
}

export function loadServerConnectionState(storage: ServerConnectionStorage) {
  try {
    const raw = storage.getItem(OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY)
    if (!raw) {
      return createDefaultServerConnectionState()
    }

    return parseServerConnectionState(JSON.parse(raw))
  } catch {
    return createDefaultServerConnectionState()
  }
}

export function saveServerConnectionState(
  storage: ServerConnectionStorage,
  state: ServerConnectionState,
) {
  try {
    storage.setItem(OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can fail in private browsing, quota exhaustion, or disabled storage modes.
  }
}

export function createMemoryServerConnectionStorage(): ServerConnectionStorage {
  const values = new Map<string, string>()

  return {
    getItem(key: string) {
      return values.get(key) ?? null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
  }
}

export function serverConnectionCacheNamespace(connection: Pick<ServerConnection, 'id'>) {
  return `server:${connection.id}`
}

function serverConnectionFromInput(input: UpsertServerConnectionInput): ServerConnection {
  const baseUrl = normalizeServerBaseUrl(input.baseUrl)
  const id = serverConnectionId(baseUrl)

  return {
    id,
    displayName: normalizeDisplayName(input.displayName, baseUrl),
    baseUrl,
    serverVersion: normalizeServerVersion(input.serverVersion),
    capabilities: normalizeCapabilities(input.capabilities),
    cacheNamespace: serverConnectionCacheNamespace({ id }),
    lastConnectedAt: input.now ?? new Date().toISOString(),
  }
}

function parseServerConnectionState(value: unknown): ServerConnectionState {
  const payload = objectValue(value) as PersistedServerConnectionState
  if (payload.version !== 1 || !Array.isArray(payload.connections)) {
    return createDefaultServerConnectionState()
  }

  const connections = payload.connections
    .map(parseServerConnection)
    .filter((connection): connection is ServerConnection => connection !== null)

  if (connections.length === 0) {
    return createDefaultServerConnectionState()
  }

  const activeConnectionId =
    typeof payload.activeConnectionId === 'string' &&
    connections.some((connection) => connection.id === payload.activeConnectionId)
      ? payload.activeConnectionId
      : connections[0].id

  return {
    version: 1,
    activeConnectionId,
    connections,
  }
}

function parseServerConnection(value: unknown): ServerConnection | null {
  const payload = objectValue(value) as PersistedServerConnection
  if (typeof payload.baseUrl !== 'string') {
    return null
  }

  try {
    const baseUrl = normalizeServerBaseUrl(payload.baseUrl)
    const id = typeof payload.id === 'string' && payload.id ? payload.id : serverConnectionId(baseUrl)

    return {
      id,
      displayName: normalizeDisplayName(stringValue(payload.displayName), baseUrl),
      baseUrl,
      serverVersion: normalizeServerVersion(stringValue(payload.serverVersion)),
      capabilities: normalizeCapabilities(payload.capabilities),
      cacheNamespace:
        typeof payload.cacheNamespace === 'string' && payload.cacheNamespace
          ? payload.cacheNamespace
          : serverConnectionCacheNamespace({ id }),
      lastConnectedAt: stringValue(payload.lastConnectedAt) ?? DEFAULT_CONNECTION_TIME,
    }
  } catch {
    return null
  }
}

function normalizeServerBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new TypeError('OpenCord server URL is required')
  }

  const url = new URL(trimmed)
  return url.toString().replace(/\/+$/, '')
}

function normalizeDisplayName(value: string | undefined, baseUrl: string) {
  const displayName = value?.trim()
  if (displayName) {
    return displayName.slice(0, 80)
  }

  const url = new URL(baseUrl)
  return url.hostname || 'OpenCord Server'
}

function normalizeServerVersion(value: string | undefined) {
  return value?.trim() || 'unknown'
}

function normalizeCapabilities(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(value.filter((capability): capability is string => typeof capability === 'string')),
  ).toSorted()
}

function serverConnectionId(baseUrl: string) {
  let hash = 2166136261
  for (const char of baseUrl) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return `srv_${(hash >>> 0).toString(36)}`
}

function objectValue(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
