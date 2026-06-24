export const OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY = 'opencord.serverConnections:v1'
export const OPENCORD_DEVICE_SESSION_ACTIVE_KEY_PREFIX = 'opencord.deviceSession.active:v1'
export const OPENCORD_DEVICE_SESSION_METADATA_KEY_PREFIX = 'opencord.deviceSession.metadata:v1'
export const OPENCORD_DEVICE_SESSION_SECRET_KEY_PREFIX = 'opencord.deviceSession.secret:v1'

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

export type DefaultServerConnectionOptions = {
  baseUrl?: string
  displayName?: string
  serverVersion?: string
  capabilities?: string[]
  now?: string
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

export type DeviceSessionMetadata = {
  version: 1
  serverUrl: string
  accountEmail: string
  displayName: string
  userId: string
  createdAt: string
  updatedAt: string
}

export type DeviceSession = DeviceSessionMetadata & {
  refreshToken: string
}

export type PersistDeviceSessionInput = {
  serverUrl: string
  accountEmail: string
  displayName: string
  userId: string
  refreshToken: string
  now?: string
}

export type DeviceSessionStore = {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export type DeviceSessionStores = {
  metadata: DeviceSessionStore
  secrets: DeviceSessionStore
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

type PersistedDeviceSessionMetadata = {
  version?: unknown
  serverUrl?: unknown
  accountEmail?: unknown
  displayName?: unknown
  userId?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

const DEFAULT_CONNECTION_TIME = '1970-01-01T00:00:00.000Z'
const DEFAULT_SERVER_BASE_URL = 'http://localhost:8080'

export function createDefaultServerConnectionState(
  input: string | DefaultServerConnectionOptions = DEFAULT_CONNECTION_TIME,
) {
  const options = typeof input === 'string' ? { now: input } : input
  const connection = serverConnectionFromInput({
    baseUrl: options.baseUrl ?? DEFAULT_SERVER_BASE_URL,
    displayName: options.displayName ?? 'Local OpenCord',
    serverVersion: options.serverVersion ?? 'unknown',
    capabilities: options.capabilities ?? [],
    now: options.now ?? DEFAULT_CONNECTION_TIME,
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

export async function persistDeviceSession(
  stores: DeviceSessionStores,
  input: PersistDeviceSessionInput,
) {
  const now = input.now ?? new Date().toISOString()
  const serverUrl = normalizeServerBaseUrl(input.serverUrl)
  const accountEmail = normalizeAccountEmail(input.accountEmail)
  const key = deviceSessionKey(serverUrl, accountEmail)
  const existing = await loadDeviceSessionMetadata(stores.metadata, key)
  const metadata: DeviceSessionMetadata = {
    version: 1,
    serverUrl,
    accountEmail,
    displayName: normalizeDisplayName(input.displayName, serverUrl),
    userId: input.userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  await stores.secrets.setItem(deviceSessionSecretStorageKey(key), input.refreshToken)
  await stores.metadata.setItem(deviceSessionMetadataStorageKey(key), JSON.stringify(metadata))
  await stores.metadata.setItem(activeDeviceSessionStorageKey(serverUrl), key)
}

export async function loadActiveDeviceSession(
  stores: DeviceSessionStores,
  serverUrl: string,
): Promise<DeviceSession | null> {
  const normalizedServerUrl = normalizeServerBaseUrl(serverUrl)
  const key = await stores.metadata.getItem(activeDeviceSessionStorageKey(normalizedServerUrl))
  if (!key) {
    return null
  }

  const metadata = await loadDeviceSessionMetadata(stores.metadata, key)
  if (!metadata || metadata.serverUrl !== normalizedServerUrl) {
    return null
  }

  const refreshToken = await stores.secrets.getItem(deviceSessionSecretStorageKey(key))
  if (!refreshToken) {
    return null
  }

  return {
    ...metadata,
    refreshToken,
  }
}

export async function clearActiveDeviceSession(stores: DeviceSessionStores, serverUrl: string) {
  const normalizedServerUrl = normalizeServerBaseUrl(serverUrl)
  const activeKey = activeDeviceSessionStorageKey(normalizedServerUrl)
  const key = await stores.metadata.getItem(activeKey)
  if (key) {
    await stores.metadata.removeItem(deviceSessionMetadataStorageKey(key))
    await stores.secrets.removeItem(deviceSessionSecretStorageKey(key))
  }
  await stores.metadata.removeItem(activeKey)
}

export function createMemoryDeviceSessionStores() {
  const metadata = createAsyncMemoryStore()
  const secrets = createAsyncMemoryStore()

  return {
    metadata,
    secrets,
    metadataSnapshot: metadata.snapshot,
    secretSnapshot: secrets.snapshot,
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

function normalizeAccountEmail(value: string) {
  const email = value.trim().toLowerCase()
  if (!email) {
    throw new TypeError('OpenCord account email is required')
  }

  return email
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
  ).sort()
}

function serverConnectionId(baseUrl: string) {
  let hash = 2166136261
  for (const char of baseUrl) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return `srv_${(hash >>> 0).toString(36)}`
}

function deviceSessionKey(serverUrl: string, accountEmail: string) {
  return `${serverConnectionId(serverUrl)}:${accountEmail}`
}

function activeDeviceSessionStorageKey(serverUrl: string) {
  return `${OPENCORD_DEVICE_SESSION_ACTIVE_KEY_PREFIX}:${serverConnectionId(serverUrl)}`
}

function deviceSessionMetadataStorageKey(key: string) {
  return `${OPENCORD_DEVICE_SESSION_METADATA_KEY_PREFIX}:${key}`
}

function deviceSessionSecretStorageKey(key: string) {
  return `${OPENCORD_DEVICE_SESSION_SECRET_KEY_PREFIX}:${key}`
}

async function loadDeviceSessionMetadata(
  storage: DeviceSessionStore,
  key: string,
): Promise<DeviceSessionMetadata | null> {
  try {
    const raw = await storage.getItem(deviceSessionMetadataStorageKey(key))
    if (!raw) {
      return null
    }

    return parseDeviceSessionMetadata(JSON.parse(raw))
  } catch {
    return null
  }
}

function parseDeviceSessionMetadata(value: unknown): DeviceSessionMetadata | null {
  const payload = objectValue(value) as PersistedDeviceSessionMetadata
  if (
    payload.version !== 1 ||
    typeof payload.serverUrl !== 'string' ||
    typeof payload.accountEmail !== 'string' ||
    typeof payload.displayName !== 'string' ||
    typeof payload.userId !== 'string' ||
    typeof payload.createdAt !== 'string' ||
    typeof payload.updatedAt !== 'string'
  ) {
    return null
  }

  try {
    return {
      version: 1,
      serverUrl: normalizeServerBaseUrl(payload.serverUrl),
      accountEmail: normalizeAccountEmail(payload.accountEmail),
      displayName: normalizeDisplayName(payload.displayName, payload.serverUrl),
      userId: payload.userId,
      createdAt: payload.createdAt,
      updatedAt: payload.updatedAt,
    }
  } catch {
    return null
  }
}

function createAsyncMemoryStore() {
  const values = new Map<string, string>()

  return {
    async getItem(key: string) {
      return values.get(key) ?? null
    },
    async setItem(key: string, value: string) {
      values.set(key, value)
    },
    async removeItem(key: string) {
      values.delete(key)
    },
    snapshot() {
      return Object.fromEntries(values)
    },
  }
}

function objectValue(value: unknown) {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
