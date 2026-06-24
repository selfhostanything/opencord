import { describe, expect, it } from 'vitest'

import {
  buildOpenCordDeepLink,
  buildOpenCordRoutePath,
  parseOpenCordDeepLink,
  parseOpenCordRouteTarget,
  type OpenCordRouteTarget,
} from './index'

describe('OpenCord client route contracts', () => {
  it('round-trips channel and message route targets through a deep link', () => {
    const target: OpenCordRouteTarget = {
      kind: 'message',
      serverId: 'local-opencord',
      organizationId: 'org-1',
      spaceId: 'space-1',
      channelId: 'general',
      messageId: 'msg-1',
    }

    const deepLink = buildOpenCordDeepLink(target)

    expect(deepLink).toBe(
      'opencord://route?kind=message&serverId=local-opencord&organizationId=org-1&spaceId=space-1&channelId=general&messageId=msg-1',
    )
    expect(parseOpenCordDeepLink(deepLink)).toEqual(target)
  })

  it('builds web route paths for channel, meeting, settings, and developer targets', () => {
    expect(
      buildOpenCordRoutePath({
        kind: 'channel',
        serverId: 'local-opencord',
        organizationId: 'org-1',
        spaceId: 'space-1',
        channelId: 'general',
      }),
    ).toBe('/servers/local-opencord/spaces/space-1/channels/general')

    expect(
      buildOpenCordRoutePath({
        kind: 'meeting',
        serverId: 'local-opencord',
        organizationId: 'org-1',
        spaceId: 'space-1',
        channelId: 'general',
        meetingId: 'meeting-1',
      }),
    ).toBe('/servers/local-opencord/spaces/space-1/channels/general/meetings/meeting-1')

    expect(
      buildOpenCordRoutePath({
        kind: 'settings',
        serverId: 'local-opencord',
        panel: 'voice-video',
      }),
    ).toBe('/settings?serverId=local-opencord&panel=voice-video')

    expect(
      buildOpenCordRoutePath({
        kind: 'developer',
        serverId: 'local-opencord',
        organizationId: 'org-1',
        spaceId: 'space-1',
        channelId: 'general',
        panel: 'webhooks',
      }),
    ).toBe('/servers/local-opencord/spaces/space-1/channels/general/developers?panel=webhooks')
  })

  it('rejects invalid route targets and foreign deep links', () => {
    expect(parseOpenCordRouteTarget({ kind: 'channel', serverId: 'local-opencord' })).toBeNull()
    expect(parseOpenCordRouteTarget({ kind: 'settings', panel: 'voice-video' })).toEqual({
      kind: 'settings',
      panel: 'voice-video',
    })
    expect(parseOpenCordRouteTarget({ kind: 'settings', panel: 'tokens' })).toBeNull()
    expect(parseOpenCordDeepLink('https://example.com/servers/local-opencord')).toBeNull()
    expect(parseOpenCordDeepLink('opencord://route?kind=message&channelId=general')).toBeNull()
  })
})
