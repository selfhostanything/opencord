import { contextBridge, ipcRenderer } from 'electron'

import {
  DEEP_LINK_ROUTE_CHANNEL,
  isDesktopDeepLinkRoute,
  type DesktopDeepLinkRoute,
} from './deepLinks'

type MessageNotificationPayload = {
  channelName: string
  authorName: string
  body: string
  own: boolean
}

const MESSAGE_NOTIFICATION_CHANNEL = 'opencord:notification:message'

contextBridge.exposeInMainWorld('openCordDesktop', {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome ?? 'unknown',
    electron: process.versions.electron ?? 'unknown',
    node: process.versions.node ?? 'unknown',
  },
  notifications: {
    showMessage(payload: MessageNotificationPayload) {
      if (!isMessageNotificationPayload(payload)) {
        return Promise.resolve(false)
      }

      return ipcRenderer.invoke(MESSAGE_NOTIFICATION_CHANNEL, payload) as Promise<boolean>
    },
  },
  deepLinks: {
    onRoute(handler: (route: DesktopDeepLinkRoute) => void) {
      if (typeof handler !== 'function') {
        return () => undefined
      }

      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        if (isDesktopDeepLinkRoute(payload)) {
          handler(payload)
        }
      }

      ipcRenderer.on(DEEP_LINK_ROUTE_CHANNEL, listener)
      return () => {
        ipcRenderer.removeListener(DEEP_LINK_ROUTE_CHANNEL, listener)
      }
    },
  },
})

function isMessageNotificationPayload(value: unknown): value is MessageNotificationPayload {
  if (!isObject(value)) {
    return false
  }

  return (
    isNonEmptyString(value.channelName) &&
    isNonEmptyString(value.authorName) &&
    isNonEmptyString(value.body) &&
    typeof value.own === 'boolean'
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}
