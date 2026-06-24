import { describe, expect, it, vi } from 'vitest'

const stores = vi.hoisted(() => ({
  asyncStorage: new Map<string, string>(),
  keychain: new Map<string, string>(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => stores.asyncStorage.get(key) ?? null),
    removeItem: vi.fn(async (key: string) => {
      stores.asyncStorage.delete(key)
    }),
    setItem: vi.fn(async (key: string, value: string) => {
      stores.asyncStorage.set(key, value)
    }),
  },
}))

vi.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly',
  },
  getGenericPassword: vi.fn(async ({ service }: { service: string }) => {
    const password = stores.keychain.get(service)
    return password ? { password, username: service } : false
  }),
  resetGenericPassword: vi.fn(async ({ service }: { service: string }) => {
    stores.keychain.delete(service)
    return true
  }),
  setGenericPassword: vi.fn(
    async (_username: string, password: string, { service }: { service: string }) => {
      stores.keychain.set(service, password)
      return true
    },
  ),
}))

import {
  clearActiveDeviceSession,
  loadActiveDeviceSession,
  persistDeviceSession,
} from '@opencord/server-connections'

import { createMobileDeviceSessionStores } from './mobileDeviceSessionStorage'

describe('mobile device session storage', () => {
  it('stores refresh tokens in Keychain and only non-secret metadata in AsyncStorage', async () => {
    stores.asyncStorage.clear()
    stores.keychain.clear()
    const deviceStores = createMobileDeviceSessionStores()

    await persistDeviceSession(deviceStores, {
      accountEmail: 'Mobile@Example.com',
      displayName: 'Mobile User',
      refreshToken: 'mobile-refresh-secret',
      serverUrl: 'http://10.0.2.2:8080',
      userId: 'mobile-user',
    })

    expect(JSON.stringify(Object.fromEntries(stores.asyncStorage))).not.toContain(
      'mobile-refresh-secret',
    )
    expect(JSON.stringify(Object.fromEntries(stores.keychain))).toContain('mobile-refresh-secret')

    await expect(loadActiveDeviceSession(deviceStores, 'http://10.0.2.2:8080')).resolves.toMatchObject(
      {
        accountEmail: 'mobile@example.com',
        displayName: 'Mobile User',
        refreshToken: 'mobile-refresh-secret',
        serverUrl: 'http://10.0.2.2:8080',
      },
    )

    await clearActiveDeviceSession(deviceStores, 'http://10.0.2.2:8080')
    await expect(loadActiveDeviceSession(deviceStores, 'http://10.0.2.2:8080')).resolves.toBeNull()
  })
})
