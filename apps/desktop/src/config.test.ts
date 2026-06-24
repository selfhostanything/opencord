import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createMainWindowOptions,
  createSecureWebPreferences,
  desktopMediaAutomationConfig,
  desktopRuntimeInfo,
  resolveRendererEntry,
} from './config'

describe('desktop shell config', () => {
  it('loads a dev renderer URL when OPENCORD_DESKTOP_RENDERER_URL is set', () => {
    expect(
      resolveRendererEntry({
        env: { OPENCORD_DESKTOP_RENDERER_URL: 'http://127.0.0.1:5173/' },
        repoRoot: '/workspace/opencord',
      }),
    ).toEqual({
      kind: 'url',
      value: 'http://127.0.0.1:5173/',
    })
  })

  it('falls back to the built web renderer file', () => {
    expect(resolveRendererEntry({ env: {}, repoRoot: '/workspace/opencord' })).toEqual({
      kind: 'file',
      value: path.join('/workspace/opencord', 'apps/web/dist/index.html'),
    })
  })

  it('uses secure BrowserWindow defaults for renderer isolation', () => {
    expect(createSecureWebPreferences('/tmp/preload.js')).toMatchObject({
      preload: '/tmp/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    })
  })

  it('creates a desktop window sized for the app shell', () => {
    expect(createMainWindowOptions('/tmp/preload.js')).toMatchObject({
      title: 'OpenCord',
      width: 1280,
      height: 840,
      minWidth: 960,
      minHeight: 640,
      show: false,
      webPreferences: {
        preload: '/tmp/preload.js',
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
  })

  it('exposes a narrow preload runtime bridge payload', () => {
    expect(
      desktopRuntimeInfo({
        platform: 'darwin',
        versions: {
          chrome: '143.0.0',
          electron: '39.0.0',
          node: '26.0.0',
        },
      }),
    ).toEqual({
      platform: 'darwin',
      versions: {
        chrome: '143.0.0',
        electron: '39.0.0',
        node: '26.0.0',
      },
    })
  })

  it('keeps desktop media automation disabled unless explicitly requested', () => {
    expect(desktopMediaAutomationConfig({})).toEqual({
      commandLineSwitches: [],
      enabled: false,
      preferredSourceName: null,
    })
  })

  it('enables deterministic e2e media permissions and capture flags', () => {
    expect(
      desktopMediaAutomationConfig({
        OPENCORD_DESKTOP_E2E_MEDIA: '1',
        OPENCORD_DESKTOP_E2E_SCREEN_SOURCE: ' Entire Screen ',
      }),
    ).toEqual({
      commandLineSwitches: [
        { name: 'use-fake-ui-for-media-stream' },
        { name: 'use-fake-device-for-media-stream' },
        { name: 'autoplay-policy', value: 'no-user-gesture-required' },
      ],
      enabled: true,
      preferredSourceName: 'Entire Screen',
    })
  })
})
