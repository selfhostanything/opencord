import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { isDeviceSessionSecretKey } from './deviceSessionSecretBridge'

export {
  DEVICE_SESSION_SECRET_GET_CHANNEL,
  DEVICE_SESSION_SECRET_REMOVE_CHANNEL,
  DEVICE_SESSION_SECRET_SET_CHANNEL,
  isDeviceSessionSecretKey,
} from './deviceSessionSecretBridge'

const SECRET_FILE_NAME = 'device-session-secrets.json'

type SafeStorageDriver = {
  decryptString(value: Buffer): string
  encryptString(value: string): Buffer
  isEncryptionAvailable(): boolean
}

type DesktopDeviceSessionSecretStoreOptions = {
  safeStorage: SafeStorageDriver
  userDataPath: string
}

type SecretFile = {
  version: 1
  values: Record<string, string>
}

export function createDesktopDeviceSessionSecretStore({
  safeStorage,
  userDataPath,
}: DesktopDeviceSessionSecretStoreOptions) {
  const filePath = path.join(userDataPath, SECRET_FILE_NAME)

  return {
    async getItem(key: string) {
      if (!isDeviceSessionSecretKey(key) || !safeStorage.isEncryptionAvailable()) {
        return null
      }

      const encrypted = readSecretFile(filePath).values[key]
      if (!encrypted) {
        return null
      }

      try {
        return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch {
        return null
      }
    },
    async removeItem(key: string) {
      if (!isDeviceSessionSecretKey(key)) {
        return
      }

      const file = readSecretFile(filePath)
      delete file.values[key]
      writeSecretFile(filePath, file)
    },
    async setItem(key: string, value: string) {
      if (!isDeviceSessionSecretKey(key) || !value || !safeStorage.isEncryptionAvailable()) {
        return
      }

      const file = readSecretFile(filePath)
      file.values[key] = safeStorage.encryptString(value).toString('base64')
      writeSecretFile(filePath, file)
    },
    readRawFile() {
      return existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
    },
  }
}

function readSecretFile(filePath: string): SecretFile {
  try {
    const payload = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<SecretFile>
    if (payload.version === 1 && payload.values && typeof payload.values === 'object') {
      return {
        version: 1,
        values: Object.fromEntries(
          Object.entries(payload.values).filter(
            (entry): entry is [string, string] =>
              isDeviceSessionSecretKey(entry[0]) && typeof entry[1] === 'string',
          ),
        ),
      }
    }
  } catch {
    // Missing or malformed secret files are treated as empty.
  }

  return { version: 1, values: {} }
}

function writeSecretFile(filePath: string, file: SecretFile) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(file), { mode: 0o600 })
}
