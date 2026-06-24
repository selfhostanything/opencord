import { NativeEventEmitter, NativeModules } from 'react-native'

import type { MobileMediaPermissionStatus } from './mobileState'

export const OPENCORD_NATIVE_CALL_PURPOSE =
  'Used to keep OpenCord voice and meeting audio visible on the lock screen and in system call controls.'

type NativeCallEventListener = {
  remove: () => void
}

type EventEmitterNativeModule = {
  addListener: (eventName: string) => void
  removeListeners: (count: number) => void
}

type NativeCallMethodName = 'endCall' | 'hasPhoneAccount' | 'setup' | 'startCall'

export type NativeCallIntegrationDriver = {
  addEventListener?: (
    event: 'endCall' | string,
    handler: (payload: { callUUID: string }) => void,
  ) => NativeCallEventListener
  endCall: (uuid: string) => void
  hasPhoneAccount?: () => Promise<boolean>
  reportConnectedOutgoingCallWithUUID?: (uuid: string) => void
  setAvailable?: (active: boolean) => void
  setCurrentCallActive?: (uuid: string) => void
  setMutedCall?: (uuid: string, muted: boolean) => void
  setup: (options: OpenCordNativeCallOptions) => Promise<boolean> | boolean
  startCall: (
    uuid: string,
    handle: string,
    displayName?: string,
    handleType?: 'generic',
    hasVideo?: boolean,
  ) => Promise<boolean> | boolean | void
}

export type OpenCordNativeCallOptions = {
  ios: {
    appName: string
    supportsVideo: boolean
    maximumCallGroups: string
    maximumCallsPerCallGroup: string
    includesCallsInRecents: boolean
    audioSession: {
      categoryOptions: number
      mode: string
    }
  }
  android: {
    alertTitle: string
    alertDescription: string
    cancelButton: string
    okButton: string
    additionalPermissions: string[]
    foregroundService: {
      channelId: string
      channelName: string
      notificationTitle: string
      notificationIcon: string
    }
  }
}

export type NativeCallIntegrationSession = {
  callUuid: string
  end: () => Promise<void>
  setMuted: (muted: boolean) => Promise<void>
}

export type NativeCallIntegrationSessionOptions = {
  callUuid: string
  displayName: string
  driver?: NativeCallIntegrationDriver
  handle: string
  hasVideo: boolean
  initialMuted: boolean
  onEnded?: (callUuid: string) => void
  platform?: string
}

const OPENCORD_NATIVE_CALL_OPTIONS: OpenCordNativeCallOptions = {
  ios: {
    appName: 'OpenCord',
    supportsVideo: true,
    maximumCallGroups: '1',
    maximumCallsPerCallGroup: '1',
    includesCallsInRecents: false,
    audioSession: {
      categoryOptions: 0x4 | 0x8,
      mode: 'AVAudioSessionModeVoiceChat',
    },
  },
  android: {
    alertTitle: 'Enable OpenCord calls',
    alertDescription:
      'OpenCord uses Android call controls for active voice channels and meetings.',
    cancelButton: 'Not now',
    okButton: 'Enable',
    additionalPermissions: [],
    foregroundService: {
      channelId: 'opencord_calls',
      channelName: 'OpenCord calls',
      notificationTitle: 'OpenCord voice connected',
      notificationIcon: 'ic_launcher',
    },
  },
}

const OPENCORD_NATIVE_END_CALL_EVENT = 'OpenCordCallControls.endCall'

let configured = false

export async function queryNativeCallIntegrationStatus({
  driver,
  platform = 'unknown',
}: {
  driver?: NativeCallIntegrationDriver
  platform?: string
} = {}): Promise<MobileMediaPermissionStatus> {
  if (!nativeCallIntegrationSupported(platform)) {
    return 'unsupported'
  }
  if (platform !== 'android') {
    return configured ? 'granted' : 'promptable'
  }

  try {
    const callDriver = driver ?? (await loadNativeCallIntegrationDriver())
    return (await callDriver.hasPhoneAccount?.()) ? 'granted' : 'promptable'
  } catch {
    return 'promptable'
  }
}

export async function requestNativeCallIntegration({
  driver,
  platform = 'unknown',
}: {
  driver?: NativeCallIntegrationDriver
  platform?: string
} = {}): Promise<MobileMediaPermissionStatus> {
  if (!nativeCallIntegrationSupported(platform)) {
    return 'unsupported'
  }

  const callDriver = driver ?? (await loadNativeCallIntegrationDriver())
  const accepted = await callDriver.setup(OPENCORD_NATIVE_CALL_OPTIONS)
  configured = accepted !== false

  if (platform === 'android') {
    callDriver.setAvailable?.(configured)
  }

  return configured ? 'granted' : 'denied'
}

export async function createNativeCallIntegrationSession({
  callUuid,
  displayName,
  driver,
  handle,
  hasVideo,
  initialMuted,
  onEnded,
  platform = 'unknown',
}: NativeCallIntegrationSessionOptions): Promise<NativeCallIntegrationSession> {
  if (!nativeCallIntegrationSupported(platform)) {
    return createNoopNativeCallIntegrationSession(callUuid)
  }

  const callDriver = driver ?? (await loadNativeCallIntegrationDriver())
  let status: MobileMediaPermissionStatus
  try {
    status = await requestNativeCallIntegration({ driver: callDriver, platform })
  } catch (error) {
    logNativeCallIntegrationFallback('setup failed', error)
    return createNoopNativeCallIntegrationSession(callUuid)
  }
  if (status !== 'granted') {
    return createNoopNativeCallIntegrationSession(callUuid)
  }

  let ended = false
  const endListener = callDriver.addEventListener?.('endCall', ({ callUUID }) => {
    if (callUUID === callUuid) {
      ended = true
      endListener?.remove()
      onEnded?.(callUuid)
    }
  })

  try {
    await callDriver.startCall(callUuid, handle, displayName, 'generic', hasVideo)
    callDriver.reportConnectedOutgoingCallWithUUID?.(callUuid)
    callDriver.setCurrentCallActive?.(callUuid)
    callDriver.setMutedCall?.(callUuid, initialMuted)
  } catch (error) {
    endListener?.remove()
    logNativeCallIntegrationFallback('start failed', error)
    return createNoopNativeCallIntegrationSession(callUuid)
  }

  return {
    callUuid,
    async end() {
      if (ended) {
        return
      }
      ended = true
      callDriver.endCall(callUuid)
      endListener?.remove()
    },
    async setMuted(muted: boolean) {
      if (!ended) {
        callDriver.setMutedCall?.(callUuid, muted)
      }
    },
  }
}

function nativeCallIntegrationSupported(platform: string) {
  return platform === 'android' || platform === 'ios'
}

function createNoopNativeCallIntegrationSession(callUuid: string): NativeCallIntegrationSession {
  return {
    callUuid,
    async end() {},
    async setMuted() {},
  }
}

function logNativeCallIntegrationFallback(reason: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(`OpenCord native call controls unavailable; continuing media-only (${reason}): ${message}`)
}

async function loadNativeCallIntegrationDriver(): Promise<NativeCallIntegrationDriver> {
  const module = NativeModules.OpenCordCallControls as
    | (NativeCallIntegrationDriver & EventEmitterNativeModule)
    | undefined

  if (!module) {
    throw new Error('OpenCord native call controls are not available.')
  }

  assertNativeCallMethod(module, 'endCall')
  assertNativeCallMethod(module, 'hasPhoneAccount')
  assertNativeCallMethod(module, 'setup')
  assertNativeCallMethod(module, 'startCall')

  const bindNativeMethod = <T extends Function>(method: T | undefined): T | undefined =>
    method ? (method.bind(module) as unknown as T) : undefined
  let emitter: NativeEventEmitter | null = null
  return {
    endCall: module.endCall.bind(module),
    hasPhoneAccount: bindNativeMethod(module.hasPhoneAccount),
    reportConnectedOutgoingCallWithUUID: bindNativeMethod(
      module.reportConnectedOutgoingCallWithUUID,
    ),
    setAvailable: bindNativeMethod(module.setAvailable),
    setCurrentCallActive: bindNativeMethod(module.setCurrentCallActive),
    setMutedCall: bindNativeMethod(module.setMutedCall),
    setup: module.setup.bind(module),
    startCall: module.startCall.bind(module),
    addEventListener(event, handler) {
      if (event !== 'endCall') {
        return { remove() {} }
      }
      emitter ??= new NativeEventEmitter(module)
      const subscription = emitter.addListener(OPENCORD_NATIVE_END_CALL_EVENT, handler)
      return {
        remove: () => subscription.remove(),
      }
    },
  }
}

function assertNativeCallMethod(
  module: Partial<NativeCallIntegrationDriver>,
  methodName: NativeCallMethodName,
) {
  if (typeof module[methodName] !== 'function') {
    const availableMethods = Object.keys(module).sort().join(', ') || 'none'
    throw new Error(
      `OpenCord native call controls are missing ${methodName}; available methods: ${availableMethods}.`,
    )
  }
}
