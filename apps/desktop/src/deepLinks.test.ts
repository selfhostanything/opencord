import { describe, expect, it } from 'vitest'

import {
  DEEP_LINK_ROUTE_CHANNEL,
  firstDesktopDeepLinkArg,
  isDesktopDeepLinkRoute,
  parseDesktopDeepLinkRoute,
} from './deepLinks'

describe('desktop deep links', () => {
  it('uses a dedicated IPC channel for validated renderer route handoff', () => {
    expect(DEEP_LINK_ROUTE_CHANNEL).toBe('opencord:deep-link:route')
  })

  it('parses only OpenCord route links into renderer route paths', () => {
    expect(
      parseDesktopDeepLinkRoute(
        'opencord://route?kind=message&serverId=local-opencord&organizationId=org-1&spaceId=space-1&channelId=general&messageId=msg-1',
      ),
    ).toEqual({
      routePath: '/servers/local-opencord/spaces/space-1/channels/general?messageId=msg-1',
      target: {
        kind: 'message',
        serverId: 'local-opencord',
        organizationId: 'org-1',
        spaceId: 'space-1',
        channelId: 'general',
        messageId: 'msg-1',
      },
    })

    expect(parseDesktopDeepLinkRoute('https://example.com/route?kind=message')).toBeNull()
    expect(parseDesktopDeepLinkRoute('opencord://route?kind=message&channelId=general')).toBeNull()
  })

  it('finds the first OpenCord route link in launch arguments', () => {
    expect(
      firstDesktopDeepLinkArg([
        '/Applications/OpenCord.app/Contents/MacOS/OpenCord',
        '--flag',
        'opencord://route?kind=settings&panel=notifications',
        'opencord://route?kind=settings&panel=voice-video',
      ]),
    ).toBe('opencord://route?kind=settings&panel=notifications')
    expect(firstDesktopDeepLinkArg(['OpenCord', 'https://example.com'])).toBeNull()
  })

  it('validates route payloads before preload exposes them to the renderer', () => {
    expect(
      isDesktopDeepLinkRoute({
        routePath: '/settings?panel=notifications',
        target: {
          kind: 'settings',
          panel: 'notifications',
        },
      }),
    ).toBe(true)
    expect(isDesktopDeepLinkRoute({ routePath: 'https://example.com', target: {} })).toBe(false)
    expect(isDesktopDeepLinkRoute({ routePath: '/settings', target: { panel: 'notifications' } }))
      .toBe(false)
  })
})
