import path from 'node:path'
import { app, BrowserWindow, Notification, ipcMain, shell } from 'electron'

import { createMainWindowOptions, resolveRendererEntry } from './config'
import {
  MESSAGE_NOTIFICATION_CHANNEL,
  buildMessageNotification,
  isMessageNotificationPayload,
  shouldShowMessageNotification,
} from './notifications'

const appRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appRoot, '../..')
const preloadPath = path.join(__dirname, 'preload.js')
const smokeMode = process.argv.includes('--smoke')

let mainWindow: BrowserWindow | null = null

ipcMain.handle(MESSAGE_NOTIFICATION_CHANNEL, (_event, payload: unknown) => {
  if (!isMessageNotificationPayload(payload) || !Notification.isSupported()) {
    return false
  }

  if (
    !shouldShowMessageNotification({
      isWindowFocused: mainWindow?.isFocused() ?? false,
      own: payload.own,
    })
  ) {
    return false
  }

  new Notification(buildMessageNotification(payload)).show()
  return true
})

async function createWindow() {
  const window = new BrowserWindow(createMainWindowOptions(preloadPath))
  mainWindow = window

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isRendererNavigationAllowed(url)) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })
  window.webContents.once('did-finish-load', () => {
    if (smokeMode) {
      console.log('opencord-desktop-ready')
      app.quit()
    }
  })
  window.once('ready-to-show', () => {
    window.show()
  })
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null
    }
  })

  const rendererEntry = resolveRendererEntry({ repoRoot })
  if (rendererEntry.kind === 'url') {
    await window.loadURL(rendererEntry.value)
  } else {
    await window.loadFile(rendererEntry.value)
  }
}

function isRendererNavigationAllowed(url: string) {
  const rendererEntry = resolveRendererEntry({ repoRoot })
  if (rendererEntry.kind === 'url') {
    return url.startsWith(rendererEntry.value)
  }

  return url.startsWith('file://')
}

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', () => {
    if (mainWindow === null || mainWindow.isDestroyed()) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
