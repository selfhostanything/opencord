import { describe, expect, it, vi } from 'vitest'
import { NativeModules } from 'react-native'

vi.mock('react-native', () => ({
  NativeEventEmitter: class {
    addListener() {
      return {
        remove() {},
      }
    }
  },
  NativeModules: {
    OpenCordCallControls: undefined,
  },
}))

import {
  OPENCORD_NATIVE_CALL_PURPOSE,
  createNativeCallIntegrationSession,
  queryNativeCallIntegrationStatus,
  requestNativeCallIntegration,
} from './nativeCallIntegration'

function createDriver(phoneAccountEnabled = true) {
  const calls: string[] = []
  let endHandler: ((payload: { callUUID: string }) => void) | null = null

  return {
    calls,
    driver: {
      addEventListener(event: string, handler: (payload: { callUUID: string }) => void) {
        calls.push(`listen:${event}`)
        if (event === 'endCall') {
          endHandler = handler
        }
        return {
          remove: () => calls.push(`remove:${event}`),
        }
      },
      endCall(uuid: string) {
        calls.push(`end:${uuid}`)
      },
      hasPhoneAccount: async () => phoneAccountEnabled,
      reportConnectedOutgoingCallWithUUID(uuid: string) {
        calls.push(`connected:${uuid}`)
      },
      setAvailable(active: boolean) {
        calls.push(`available:${active}`)
      },
      setCurrentCallActive(uuid: string) {
        calls.push(`active:${uuid}`)
      },
      setMutedCall(uuid: string, muted: boolean) {
        calls.push(`muted:${uuid}:${muted}`)
      },
      setup: async () => {
        calls.push('setup')
        return true
      },
      startCall(
        uuid: string,
        handle: string,
        displayName?: string,
        handleType?: string,
        hasVideo?: boolean,
      ) {
        calls.push(`start:${uuid}:${handle}:${displayName}:${handleType}:${hasVideo}`)
      },
    },
    emitEnd(uuid: string) {
      endHandler?.({ callUUID: uuid })
    },
  }
}

describe('native call integration', () => {
  it('documents the quiet settings purpose text', () => {
    expect(OPENCORD_NATIVE_CALL_PURPOSE).toBe(
      'Used to keep OpenCord voice and meeting audio visible on the lock screen and in system call controls.',
    )
  })

  it('queries Android phone-account state without triggering incoming call UI', async () => {
    const { calls, driver } = createDriver(true)

    await expect(
      queryNativeCallIntegrationStatus({ driver, platform: 'android' }),
    ).resolves.toBe('granted')

    expect(calls).toEqual([])
  })

  it('requests platform call integration setup and Android availability', async () => {
    const { calls, driver } = createDriver(true)

    await expect(requestNativeCallIntegration({ driver, platform: 'android' })).resolves.toBe(
      'granted',
    )

    expect(calls).toEqual(['setup', 'available:true'])
  })

  it('starts an active call session and syncs mute/end lifecycle', async () => {
    const { calls, driver } = createDriver(true)

    const session = await createNativeCallIntegrationSession({
      callUuid: '019ef679-303f-72f2-83bd-4501222533f2',
      displayName: 'Standup',
      driver,
      handle: 'voice:standup',
      hasVideo: false,
      initialMuted: false,
      platform: 'ios',
    })

    await session.setMuted(true)
    await session.end()
    await session.end()

    expect(calls).toEqual([
      'setup',
      'listen:endCall',
      'start:019ef679-303f-72f2-83bd-4501222533f2:voice:standup:Standup:generic:false',
      'connected:019ef679-303f-72f2-83bd-4501222533f2',
      'active:019ef679-303f-72f2-83bd-4501222533f2',
      'muted:019ef679-303f-72f2-83bd-4501222533f2:false',
      'muted:019ef679-303f-72f2-83bd-4501222533f2:true',
      'end:019ef679-303f-72f2-83bd-4501222533f2',
      'remove:endCall',
    ])
  })

  it('keeps media sessions usable when native OS call UI start fails', async () => {
    const { calls, driver } = createDriver(true)
    driver.startCall = async (uuid: string) => {
      calls.push(`start:${uuid}`)
      throw new Error('CallKit transaction failed')
    }

    const session = await createNativeCallIntegrationSession({
      callUuid: '019ef679-303f-72f2-83bd-4501222533f2',
      displayName: 'Standup',
      driver,
      handle: 'voice:standup',
      hasVideo: false,
      initialMuted: false,
      platform: 'ios',
    })

    await session.setMuted(true)
    await session.end()

    expect(calls).toEqual([
      'setup',
      'listen:endCall',
      'start:019ef679-303f-72f2-83bd-4501222533f2',
      'remove:endCall',
    ])
  })

  it('uses optional lifecycle methods exposed as non-enumerable native module methods', async () => {
    const calls: string[] = []
    const nativeModule = {}
    Object.defineProperties(nativeModule, {
      endCall: {
        enumerable: true,
        value: (uuid: string) => calls.push(`end:${uuid}`),
      },
      hasPhoneAccount: {
        enumerable: true,
        value: async () => true,
      },
      reportConnectedOutgoingCallWithUUID: {
        enumerable: false,
        value: (uuid: string) => calls.push(`connected:${uuid}`),
      },
      setCurrentCallActive: {
        enumerable: false,
        value: (uuid: string) => calls.push(`active:${uuid}`),
      },
      setMutedCall: {
        enumerable: false,
        value: (uuid: string, muted: boolean) => calls.push(`muted:${uuid}:${muted}`),
      },
      setup: {
        enumerable: true,
        value: async () => {
          calls.push('setup')
          return true
        },
      },
      startCall: {
        enumerable: true,
        value: (uuid: string) => calls.push(`start:${uuid}`),
      },
    })

    NativeModules.OpenCordCallControls = nativeModule

    const session = await createNativeCallIntegrationSession({
      callUuid: '019ef679-303f-72f2-83bd-4501222533f2',
      displayName: 'Standup',
      handle: 'voice:standup',
      hasVideo: false,
      initialMuted: false,
      platform: 'ios',
    })
    await session.setMuted(true)
    await session.end()

    NativeModules.OpenCordCallControls = undefined

    expect(calls).toEqual([
      'setup',
      'start:019ef679-303f-72f2-83bd-4501222533f2',
      'connected:019ef679-303f-72f2-83bd-4501222533f2',
      'active:019ef679-303f-72f2-83bd-4501222533f2',
      'muted:019ef679-303f-72f2-83bd-4501222533f2:false',
      'muted:019ef679-303f-72f2-83bd-4501222533f2:true',
      'end:019ef679-303f-72f2-83bd-4501222533f2',
    ])
  })

  it('notifies when native OS controls end the active call', async () => {
    const { calls, driver, emitEnd } = createDriver(true)
    const ended: string[] = []

    await createNativeCallIntegrationSession({
      callUuid: '019ef679-303f-72f2-83bd-4501222533f2',
      displayName: 'Standup',
      driver,
      handle: 'voice:standup',
      hasVideo: false,
      initialMuted: false,
      onEnded: (uuid) => ended.push(uuid),
      platform: 'android',
    })
    emitEnd('019ef679-303f-72f2-83bd-4501222533f2')

    expect(ended).toEqual(['019ef679-303f-72f2-83bd-4501222533f2'])
    expect(calls).toContain('available:true')
  })
})
