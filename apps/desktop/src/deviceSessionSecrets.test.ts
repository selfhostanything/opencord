import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  DEVICE_SESSION_SECRET_GET_CHANNEL,
  DEVICE_SESSION_SECRET_REMOVE_CHANNEL,
  DEVICE_SESSION_SECRET_SET_CHANNEL,
  createDesktopDeviceSessionSecretStore,
  isDeviceSessionSecretKey,
} from './deviceSessionSecrets'

function fakeSafeStorage() {
  return {
    decryptString(value: Buffer) {
      return Buffer.from(value.toString('utf8'), 'base64').toString('utf8')
    },
    encryptString(value: string) {
      return Buffer.from(Buffer.from(value, 'utf8').toString('base64'), 'utf8')
    },
    isEncryptionAvailable() {
      return true
    },
  }
}

describe('desktop device session secrets', () => {
  it('uses dedicated IPC channel names and validates shared secret keys', () => {
    expect(DEVICE_SESSION_SECRET_GET_CHANNEL).toBe('opencord:device-session-secret:get')
    expect(DEVICE_SESSION_SECRET_SET_CHANNEL).toBe('opencord:device-session-secret:set')
    expect(DEVICE_SESSION_SECRET_REMOVE_CHANNEL).toBe('opencord:device-session-secret:remove')
    expect(isDeviceSessionSecretKey('opencord.deviceSession.secret:v1:srv_123:user@example.com')).toBe(
      true,
    )
    expect(isDeviceSessionSecretKey('opencord.serverConnections:v1')).toBe(false)
  })

  it('encrypts refresh-token secrets on disk and can remove them', async () => {
    const userDataPath = mkdtempSync(path.join(tmpdir(), 'opencord-device-session-'))
    try {
      const store = createDesktopDeviceSessionSecretStore({
        safeStorage: fakeSafeStorage(),
        userDataPath,
      })
      const key = 'opencord.deviceSession.secret:v1:srv_123:user@example.com'

      await store.setItem(key, 'desktop-refresh-secret')

      expect(store.readRawFile()).not.toContain('desktop-refresh-secret')
      await expect(store.getItem(key)).resolves.toBe('desktop-refresh-secret')

      await store.removeItem(key)
      await expect(store.getItem(key)).resolves.toBeNull()
    } finally {
      rmSync(userDataPath, { force: true, recursive: true })
    }
  })
})
