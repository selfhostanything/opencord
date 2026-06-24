import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const mobileRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readMobileFile(path: string) {
  return readFileSync(resolve(mobileRoot, path), 'utf8')
}

describe('native mobile media configuration', () => {
  it('declares Android media permissions required for LiveKit and WebRTC', () => {
    const manifest = readMobileFile('android/app/src/main/AndroidManifest.xml')

    expect(manifest).toContain('android.permission.RECORD_AUDIO')
    expect(manifest).toContain('android.permission.CAMERA')
    expect(manifest).toContain('android.permission.ACCESS_NETWORK_STATE')
    expect(manifest).toContain('android.permission.CHANGE_NETWORK_STATE')
    expect(manifest).toContain('android.permission.MODIFY_AUDIO_SETTINGS')
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE')
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION')
    expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_PHONE_CALL')
    expect(manifest).toContain('android.permission.READ_PHONE_STATE')
    expect(manifest).toContain('android.permission.MANAGE_OWN_CALLS')
    expect(manifest).toContain('android.hardware.microphone')
    expect(manifest).toContain('android.hardware.audio.output')
  })

  it('declares Android ConnectionService integration for native call controls', () => {
    const manifest = readMobileFile('android/app/src/main/AndroidManifest.xml')
    const service = readMobileFile(
      'android/app/src/main/java/com/opencord/OpenCordConnectionService.kt',
    )
    const module = readMobileFile(
      'android/app/src/main/java/com/opencord/OpenCordCallControlsModule.kt',
    )

    expect(manifest).toContain('.OpenCordConnectionService')
    expect(manifest).toContain('android.permission.BIND_TELECOM_CONNECTION_SERVICE')
    expect(manifest).toContain('android.telecom.ConnectionService')
    expect(service).toContain('class OpenCordConnectionService : ConnectionService()')
    expect(module).toContain('TelecomManager')
    expect(module).toContain('PhoneAccount')
  })

  it('sets up LiveKit before React Native initializes on Android', () => {
    const mainApplication = readMobileFile(
      'android/app/src/main/java/com/opencord/MainApplication.kt',
    )
    const mainActivity = readMobileFile('android/app/src/main/java/com/opencord/MainActivity.kt')

    expect(mainApplication).toContain('LiveKitReactNative.setup')
    expect(mainApplication).toContain('AudioType.CommunicationAudioType')
    expect(mainApplication).toContain('OpenCordCallControlsPackage()')
    expect(mainActivity).toContain('enableMediaProjectionService = true')
    expect(mainActivity).toContain('"rememberDevice"')
    expect(mainActivity).toContain('"OPENCORD_E2E_REMEMBER_DEVICE"')
    expect(mainActivity).toContain('"restoreOnly"')
    expect(mainActivity).toContain('"OPENCORD_E2E_RESTORE_ONLY"')
    expect(mainActivity).toContain('"preferredTextChannelName"')
    expect(mainActivity).toContain('"OPENCORD_E2E_TEXT_CHANNEL"')
  })

  it('registers LiveKit globals before the native app component mounts', () => {
    const entrypoint = readMobileFile('index.js')

    expect(entrypoint).toContain("registerGlobals")
    expect(entrypoint.indexOf('registerGlobals()')).toBeLessThan(
      entrypoint.indexOf('AppRegistry.registerComponent'),
    )
  })

  it('includes iOS native project permission purpose strings and LiveKit setup', () => {
    const infoPlistPath = resolve(mobileRoot, 'ios/OpenCord/Info.plist')
    const appDelegatePath = resolve(mobileRoot, 'ios/OpenCord/AppDelegate.swift')

    expect(existsSync(infoPlistPath)).toBe(true)
    expect(existsSync(appDelegatePath)).toBe(true)

    const infoPlist = readFileSync(infoPlistPath, 'utf8')
    const appDelegate = readFileSync(appDelegatePath, 'utf8')

    expect(infoPlist).toContain('NSMicrophoneUsageDescription')
    expect(infoPlist).toContain('Used when you speak in voice channels or meetings.')
    expect(infoPlist).toContain('NSCameraUsageDescription')
    expect(infoPlist).toContain('Used when you turn on video in meetings.')
    expect(infoPlist).toContain('UIBackgroundModes')
    expect(infoPlist).toContain('<string>audio</string>')
    expect(infoPlist).toContain('<string>voip</string>')
    expect(appDelegate).toContain('LivekitReactNative.setup()')
    expect(appDelegate).toContain('"rememberDevice"')
    expect(appDelegate).toContain('OPENCORD_E2E_REMEMBER_DEVICE')
    expect(appDelegate).toContain('"restoreOnly"')
    expect(appDelegate).toContain('OPENCORD_E2E_RESTORE_ONLY')
    expect(appDelegate).toContain('"preferredTextChannelName"')
    expect(appDelegate).toContain('OPENCORD_E2E_TEXT_CHANNEL')
  })

  it('links iOS native storage modules used for remembered device sessions', () => {
    const podfileLock = readMobileFile('ios/Podfile.lock')

    expect(podfileLock).toContain(
      'AsyncStorage (from `../node_modules/@react-native-async-storage/async-storage`)',
    )
    expect(podfileLock).toContain('RNKeychain (from `../node_modules/react-native-keychain`)')
  })

  it('includes native iOS CallKit bridge sources', () => {
    const swiftBridge = readMobileFile('ios/OpenCord/OpenCordCallControls.swift')
    const objcExports = readMobileFile('ios/OpenCord/OpenCordCallControls.m')

    expect(swiftBridge).toContain('import CallKit')
    expect(swiftBridge).toContain('CXProvider')
    expect(swiftBridge).toContain('CXCallController')
    expect(objcExports).toContain('RCT_EXTERN_MODULE(OpenCordCallControls')
  })

  it('does not depend on the incompatible third-party CallKeep bridge', () => {
    const packageJson = readMobileFile('package.json')

    expect(packageJson).not.toContain('"react-native-callkeep"')
  })

  it('loads the native call bridge through OpenCord-owned native modules', () => {
    const nativeCallIntegration = readMobileFile('src/nativeCallIntegration.ts')

    expect(nativeCallIntegration).toContain('NativeModules.OpenCordCallControls')
    expect(nativeCallIntegration).not.toContain("require('react-native-callkeep')")
    expect(nativeCallIntegration).not.toContain("import('react-native-callkeep')")
  })
})
