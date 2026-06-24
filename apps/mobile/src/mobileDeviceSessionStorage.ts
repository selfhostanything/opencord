import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Keychain from 'react-native-keychain'
import type { DeviceSessionStore, DeviceSessionStores } from '@opencord/server-connections'

const KEYCHAIN_SERVICE_PREFIX = 'org.opencord.device-session'

type AsyncStorageDriver = {
  getItem(key: string): Promise<string | null>
  removeItem(key: string): Promise<void>
  setItem(key: string, value: string): Promise<void>
}

type KeychainDriver = {
  ACCESSIBLE?: typeof Keychain.ACCESSIBLE
  getGenericPassword: typeof Keychain.getGenericPassword
  resetGenericPassword: typeof Keychain.resetGenericPassword
  setGenericPassword: typeof Keychain.setGenericPassword
}

export function createMobileDeviceSessionStores(): DeviceSessionStores {
  return {
    metadata: createAsyncStorageDeviceSessionStore(),
    secrets: createKeychainDeviceSessionStore(),
  }
}

export function createAsyncStorageDeviceSessionStore(
  storage: AsyncStorageDriver = AsyncStorage,
): DeviceSessionStore {
  return {
    getItem: (key) => storage.getItem(key),
    removeItem: (key) => storage.removeItem(key),
    setItem: (key, value) => storage.setItem(key, value),
  }
}

export function createKeychainDeviceSessionStore(
  keychain: KeychainDriver = Keychain,
): DeviceSessionStore {
  return {
    async getItem(key) {
      const credentials = await keychain.getGenericPassword({ service: keychainService(key) })
      return credentials ? credentials.password : null
    },
    async removeItem(key) {
      await keychain.resetGenericPassword({ service: keychainService(key) })
    },
    async setItem(key, value) {
      await keychain.setGenericPassword(key, value, {
        accessible: keychain.ACCESSIBLE?.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        service: keychainService(key),
      })
    },
  }
}

function keychainService(key: string) {
  return `${KEYCHAIN_SERVICE_PREFIX}.${encodeURIComponent(key)}`
}
