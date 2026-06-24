import { describe, expect, it } from 'vitest'

import {
  OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY,
  activeServerConnection,
  createDefaultServerConnectionState,
  createMemoryDeviceSessionStores,
  createMemoryServerConnectionStorage,
  clearActiveDeviceSession,
  loadActiveDeviceSession,
  loadServerConnectionState,
  persistDeviceSession,
  removeServerConnection,
  saveServerConnectionState,
  serverConnectionCacheNamespace,
  switchServerConnection,
  upsertServerConnection,
} from './index'

describe('server connection manager', () => {
  it('starts with a default local OpenCord server connection', () => {
    const state = createDefaultServerConnectionState('2026-06-23T02:00:00.000Z')
    const active = activeServerConnection(state)

    expect(state.version).toBe(1)
    expect(state.connections).toHaveLength(1)
    expect(active).toMatchObject({
      displayName: 'Local OpenCord',
      baseUrl: 'http://localhost:8080',
      serverVersion: 'unknown',
      capabilities: [],
      lastConnectedAt: '2026-06-23T02:00:00.000Z',
    })
    expect(active?.cacheNamespace).toBe(`server:${active?.id}`)
  })

  it('supports platform-specific local default server connections', () => {
    const state = createDefaultServerConnectionState({
      baseUrl: 'http://10.0.2.2:8080',
      displayName: 'Local OpenCord',
      now: '2026-06-23T02:00:00.000Z',
    })
    const active = activeServerConnection(state)

    expect(state.connections).toHaveLength(1)
    expect(active).toMatchObject({
      displayName: 'Local OpenCord',
      baseUrl: 'http://10.0.2.2:8080',
      lastConnectedAt: '2026-06-23T02:00:00.000Z',
    })
  })

  it('adds two independent servers, switches active server, and keeps separate cache namespaces', () => {
    const initial = createDefaultServerConnectionState('2026-06-23T02:00:00.000Z')
    const withCompany = upsertServerConnection(initial, {
      baseUrl: ' https://chat.company.com/// ',
      displayName: 'Company Chat',
      serverVersion: '0.1.0',
      capabilities: ['uuidv7', 'messages'],
      now: '2026-06-23T02:01:00.000Z',
    })
    const withCommunity = upsertServerConnection(withCompany, {
      baseUrl: 'https://cord.community.example',
      displayName: 'Community',
      serverVersion: '0.2.0',
      capabilities: ['uuidv7'],
      now: '2026-06-23T02:02:00.000Z',
    })

    expect(withCommunity.connections.map((connection) => connection.baseUrl)).toEqual([
      'http://localhost:8080',
      'https://chat.company.com',
      'https://cord.community.example',
    ])
    expect(activeServerConnection(withCommunity)?.displayName).toBe('Community')

    const company = withCommunity.connections.find(
      (connection) => connection.baseUrl === 'https://chat.company.com',
    )
    const community = withCommunity.connections.find(
      (connection) => connection.baseUrl === 'https://cord.community.example',
    )
    expect(company).toBeDefined()
    expect(community).toBeDefined()
    expect(serverConnectionCacheNamespace(company!)).not.toBe(
      serverConnectionCacheNamespace(community!),
    )

    const switched = switchServerConnection(withCommunity, company!.id)
    expect(activeServerConnection(switched)?.displayName).toBe('Company Chat')
  })

  it('deduplicates by normalized base URL while preserving the connection id', () => {
    const state = upsertServerConnection(createDefaultServerConnectionState(), {
      baseUrl: 'https://chat.company.com',
      displayName: 'Company Chat',
      serverVersion: '0.1.0',
      capabilities: ['messages'],
      now: '2026-06-23T02:01:00.000Z',
    })
    const existing = activeServerConnection(state)
    const updated = upsertServerConnection(state, {
      baseUrl: ' https://chat.company.com/ ',
      displayName: 'Company Internal',
      serverVersion: '0.1.1',
      capabilities: ['messages', 'audit'],
      now: '2026-06-23T02:02:00.000Z',
    })

    expect(updated.connections).toHaveLength(2)
    expect(activeServerConnection(updated)).toMatchObject({
      id: existing?.id,
      displayName: 'Company Internal',
      serverVersion: '0.1.1',
      capabilities: ['audit', 'messages'],
      lastConnectedAt: '2026-06-23T02:02:00.000Z',
    })
  })

  it('removes inactive and active connections without leaving an invalid active id', () => {
    const state = upsertServerConnection(createDefaultServerConnectionState(), {
      baseUrl: 'https://chat.company.com',
      displayName: 'Company Chat',
      now: '2026-06-23T02:01:00.000Z',
    })
    const local = state.connections[0]
    const company = activeServerConnection(state)!

    const removedInactive = removeServerConnection(state, local.id)
    expect(removedInactive.connections).toHaveLength(1)
    expect(activeServerConnection(removedInactive)?.id).toBe(company.id)

    const removedActive = removeServerConnection(removedInactive, company.id)
    expect(removedActive.connections).toHaveLength(1)
    expect(activeServerConnection(removedActive)?.baseUrl).toBe('http://localhost:8080')
  })

  it('persists minimal versioned connection state and recovers from invalid storage', () => {
    const storage = createMemoryServerConnectionStorage()
    const state = upsertServerConnection(createDefaultServerConnectionState(), {
      baseUrl: 'https://chat.company.com',
      displayName: 'Company Chat',
      serverVersion: '0.1.0',
      capabilities: ['uuidv7', 'messages'],
      now: '2026-06-23T02:01:00.000Z',
    })

    saveServerConnectionState(storage, state)
    expect(storage.getItem(OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY)).toContain('"version":1')
    expect(loadServerConnectionState(storage)).toEqual(state)

    storage.setItem(OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY, '{"version":2}')
    expect(loadServerConnectionState(storage).connections).toHaveLength(1)

    storage.setItem(OPENCORD_SERVER_CONNECTIONS_STORAGE_KEY, 'not json')
    expect(loadServerConnectionState(storage).connections).toHaveLength(1)
  })

  it('keeps persistent device refresh tokens out of normal metadata storage', async () => {
    const stores = createMemoryDeviceSessionStores()

    await persistDeviceSession(stores, {
      accountEmail: 'Alpha@Example.com',
      displayName: 'Alpha User',
      refreshToken: 'refresh-token-secret',
      serverUrl: ' https://chat.company.com/ ',
      userId: 'user-alpha',
    })

    expect(JSON.stringify(stores.metadataSnapshot())).not.toContain('refresh-token-secret')
    expect(JSON.stringify(stores.secretSnapshot())).toContain('refresh-token-secret')

    const restored = await loadActiveDeviceSession(stores, 'https://chat.company.com')
    expect(restored).toMatchObject({
      accountEmail: 'alpha@example.com',
      displayName: 'Alpha User',
      refreshToken: 'refresh-token-secret',
      serverUrl: 'https://chat.company.com',
      userId: 'user-alpha',
    })

    await clearActiveDeviceSession(stores, 'https://chat.company.com/')
    expect(await loadActiveDeviceSession(stores, 'https://chat.company.com')).toBeNull()
  })
})
