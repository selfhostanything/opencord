import path from 'node:path'
import { app, BrowserWindow, Notification, desktopCapturer, ipcMain, session, shell } from 'electron'

import {
  createMainWindowOptions,
  desktopMediaAutomationConfig,
  resolveRendererEntry,
  type DesktopMediaAutomationConfig,
} from './config'
import {
  DEEP_LINK_ROUTE_CHANNEL,
  firstDesktopDeepLinkArg,
  parseDesktopDeepLinkRoute,
  type DesktopDeepLinkRoute,
} from './deepLinks'
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
const mediaAutomationConfig = desktopMediaAutomationConfig()

let mainWindow: BrowserWindow | null = null
let pendingDeepLinkRoute: DesktopDeepLinkRoute | null = null

applyDesktopMediaAutomationCommandLine(mediaAutomationConfig)
captureDesktopDeepLink(firstDesktopDeepLinkArg(process.argv))

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
    flushPendingDeepLinkRoute(window)
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

const singleInstanceLock = app.requestSingleInstanceLock()

if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    captureDesktopDeepLink(firstDesktopDeepLinkArg(argv))
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
      flushPendingDeepLinkRoute(mainWindow)
    }
  })

  app.on('open-url', (event, url) => {
    event.preventDefault()
    captureDesktopDeepLink(url)
    if (mainWindow) {
      flushPendingDeepLinkRoute(mainWindow)
    }
  })

  app.whenReady().then(async () => {
    app.setAsDefaultProtocolClient('opencord')
    configureDesktopMediaAutomation(mediaAutomationConfig)
    await createWindow()

    app.on('activate', () => {
      if (mainWindow === null || mainWindow.isDestroyed()) {
        void createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function applyDesktopMediaAutomationCommandLine(config: DesktopMediaAutomationConfig) {
  if (!config.enabled) {
    return
  }

  for (const commandLineSwitch of config.commandLineSwitches) {
    if (commandLineSwitch.value) {
      app.commandLine.appendSwitch(commandLineSwitch.name, commandLineSwitch.value)
    } else {
      app.commandLine.appendSwitch(commandLineSwitch.name)
    }
  }
}

function configureDesktopMediaAutomation(config: DesktopMediaAutomationConfig) {
  if (!config.enabled) {
    return
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) =>
    permission === 'media',
  )
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    void selectDesktopCaptureSource(config).then((source) => {
      if (!source) {
        callback({})
        return
      }

      console.log(`opencord-desktop-e2e-display-source:${source.id}:${source.name}`)
      callback({ video: source })
    })
  }, { useSystemPicker: false })
  console.log('opencord-desktop-media-e2e-ready')
}

async function selectDesktopCaptureSource(config: DesktopMediaAutomationConfig) {
  const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
  const preferredSourceName = config.preferredSourceName?.toLowerCase()
  if (preferredSourceName) {
    const preferredSource = sources.find((source) =>
      source.name.toLowerCase().includes(preferredSourceName),
    )
    if (preferredSource) {
      return preferredSource
    }
  }

  return sources.find((source) => source.id.startsWith('screen:')) ?? sources[0] ?? null
}

function captureDesktopDeepLink(value: string | null) {
  if (!value) {
    return false
  }

  const route = parseDesktopDeepLinkRoute(value)
  if (!route) {
    return false
  }

  pendingDeepLinkRoute = route
  return true
}

function flushPendingDeepLinkRoute(window: BrowserWindow) {
  if (!pendingDeepLinkRoute) {
    return
  }

  window.webContents.send(DEEP_LINK_ROUTE_CHANNEL, pendingDeepLinkRoute)
  pendingDeepLinkRoute = null
}
