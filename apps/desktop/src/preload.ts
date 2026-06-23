import { contextBridge, ipcRenderer } from 'electron'

import { desktopRuntimeInfo } from './config'
import {
  MESSAGE_NOTIFICATION_CHANNEL,
  isMessageNotificationPayload,
  type MessageNotificationPayload,
} from './notifications'

contextBridge.exposeInMainWorld('openCordDesktop', {
  ...desktopRuntimeInfo(),
  notifications: {
    showMessage(payload: MessageNotificationPayload) {
      if (!isMessageNotificationPayload(payload)) {
        return Promise.resolve(false)
      }

      return ipcRenderer.invoke(MESSAGE_NOTIFICATION_CHANNEL, payload) as Promise<boolean>
    },
  },
})
