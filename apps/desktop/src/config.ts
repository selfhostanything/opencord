import path from 'node:path'
import type { BrowserWindowConstructorOptions, WebPreferences } from 'electron'

export type RendererEntry =
  | { kind: 'url'; value: string }
  | { kind: 'file'; value: string }

export type RendererEntryOptions = {
  env?: Partial<Record<string, string | undefined>>
  repoRoot: string
}

export type DesktopRuntimeInfo = {
  platform: NodeJS.Platform
  versions: {
    chrome: string
    electron: string
    node: string
  }
}

export type DesktopRuntimeOptions = {
  platform?: NodeJS.Platform
  versions?: Partial<NodeJS.ProcessVersions>
}

export type DesktopCommandLineSwitch = {
  name: string
  value?: string
}

export type DesktopMediaAutomationConfig = {
  commandLineSwitches: DesktopCommandLineSwitch[]
  enabled: boolean
  preferredSourceName: string | null
}

export function resolveRendererEntry({
  env = process.env,
  repoRoot,
}: RendererEntryOptions): RendererEntry {
  const devRendererUrl = env.OPENCORD_DESKTOP_RENDERER_URL?.trim()
  if (devRendererUrl) {
    return { kind: 'url', value: devRendererUrl }
  }

  return {
    kind: 'file',
    value: path.join(repoRoot, 'apps/web/dist/index.html'),
  }
}

export function createSecureWebPreferences(preload: string): WebPreferences {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  }
}

export function createMainWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    title: 'OpenCord',
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#151515',
    webPreferences: createSecureWebPreferences(preload),
  }
}

export function desktopMediaAutomationConfig(
  env: Partial<Record<string, string | undefined>> = process.env,
): DesktopMediaAutomationConfig {
  if (env.OPENCORD_DESKTOP_E2E_MEDIA !== '1') {
    return {
      commandLineSwitches: [],
      enabled: false,
      preferredSourceName: null,
    }
  }

  return {
    commandLineSwitches: [
      { name: 'use-fake-ui-for-media-stream' },
      { name: 'use-fake-device-for-media-stream' },
      { name: 'autoplay-policy', value: 'no-user-gesture-required' },
    ],
    enabled: true,
    preferredSourceName: trimmedString(env.OPENCORD_DESKTOP_E2E_SCREEN_SOURCE),
  }
}

export function desktopRuntimeInfo(options: DesktopRuntimeOptions = {}): DesktopRuntimeInfo {
  const versions = options.versions ?? process.versions

  return {
    platform: options.platform ?? process.platform,
    versions: {
      chrome: versions.chrome ?? 'unknown',
      electron: versions.electron ?? 'unknown',
      node: versions.node ?? 'unknown',
    },
  }
}

function trimmedString(value: string | undefined) {
  return value?.trim() || null
}
