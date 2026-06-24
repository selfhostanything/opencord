import { Linking, PermissionsAndroid, Platform } from 'react-native'
import * as LiveKitWebRtc from '@livekit/react-native-webrtc'

import type {
  MobileMediaPermissionKind,
  MobileMediaPermissionStatus,
  MobileMediaPermissions,
} from './mobileState'
import {
  queryNativeCallIntegrationStatus,
  requestNativeCallIntegration,
} from './nativeCallIntegration'

type NativeMediaStream = {
  getTracks: () => Array<{ stop: () => void }>
}

type NativeMediaDevicesModule = {
  mediaDevices?: {
    getUserMedia: (constraints: Record<string, unknown>) => Promise<NativeMediaStream>
  }
}

export async function queryNativeMediaPermissions(): Promise<Partial<MobileMediaPermissions>> {
  if (Platform.OS !== 'android') {
    return {
      camera: 'promptable',
      microphone: 'promptable',
      nativeCallIntegration: await queryNativeCallIntegrationStatus({ platform: Platform.OS }),
      notifications: Platform.OS === 'ios' ? 'system-settings-required' : 'unsupported',
      screenShare: Platform.OS === 'ios' ? 'system-settings-required' : 'unsupported',
      speaker: 'unsupported',
    }
  }

  const [microphoneGranted, cameraGranted] = await Promise.all([
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO),
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA),
  ])

  return {
    camera: cameraGranted ? 'granted' : 'promptable',
    microphone: microphoneGranted ? 'granted' : 'promptable',
    nativeCallIntegration: await queryNativeCallIntegrationStatus({ platform: Platform.OS }),
    notifications: await queryAndroidNotificationPermission(),
    screenShare: 'promptable',
    speaker: 'unsupported',
  }
}

export async function requestNativeMediaPermission(
  kind: MobileMediaPermissionKind,
): Promise<MobileMediaPermissionStatus> {
  if (kind === 'speaker') {
    return 'unsupported'
  }
  if (kind === 'nativeCallIntegration') {
    return requestNativeCallIntegration({ platform: Platform.OS })
  }

  if (Platform.OS === 'android') {
    return requestAndroidMediaPermission(kind)
  }

  if (Platform.OS === 'ios') {
    return requestIosMediaPermission(kind)
  }

  return 'unsupported'
}

export async function openNativePermissionSettings() {
  await Linking.openSettings()
}

async function requestAndroidMediaPermission(
  kind: MobileMediaPermissionKind,
): Promise<MobileMediaPermissionStatus> {
  if (kind === 'screenShare') {
    return 'promptable'
  }
  if (kind === 'notifications') {
    return requestAndroidNotificationPermission()
  }
  if (kind === 'nativeCallIntegration') {
    return requestNativeCallIntegration({ platform: 'android' })
  }

  const permission =
    kind === 'microphone'
      ? PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      : PermissionsAndroid.PERMISSIONS.CAMERA
  const result = await PermissionsAndroid.request(permission)

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted'
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'system-settings-required'
  }

  return 'denied'
}

async function requestIosMediaPermission(
  kind: MobileMediaPermissionKind,
): Promise<MobileMediaPermissionStatus> {
  if (kind === 'screenShare') {
    return 'system-settings-required'
  }
  if (kind === 'notifications') {
    return 'system-settings-required'
  }
  if (kind === 'nativeCallIntegration') {
    return requestNativeCallIntegration({ platform: 'ios' })
  }
  if (kind !== 'microphone' && kind !== 'camera') {
    return 'unsupported'
  }

  try {
    const { mediaDevices } = LiveKitWebRtc as NativeMediaDevicesModule
    if (!mediaDevices) {
      return 'unsupported'
    }
    const stream = await mediaDevices.getUserMedia({
      audio: kind === 'microphone',
      video: kind === 'camera',
    })
    stream.getTracks().forEach((track) => track.stop())

    return 'granted'
  } catch {
    return 'denied'
  }
}

async function queryAndroidNotificationPermission(): Promise<MobileMediaPermissionStatus> {
  if (Number(Platform.Version) < 33) {
    return 'granted'
  }

  const granted = await PermissionsAndroid.check(androidPostNotificationsPermission())
  return granted ? 'granted' : 'promptable'
}

async function requestAndroidNotificationPermission(): Promise<MobileMediaPermissionStatus> {
  if (Number(Platform.Version) < 33) {
    return 'granted'
  }

  const result = await PermissionsAndroid.request(androidPostNotificationsPermission())
  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    return 'granted'
  }
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'system-settings-required'
  }

  return 'denied'
}

function androidPostNotificationsPermission() {
  return 'android.permission.POST_NOTIFICATIONS' as Parameters<typeof PermissionsAndroid.check>[0]
}
