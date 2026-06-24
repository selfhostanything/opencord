import { describe, expect, it } from 'vitest'

import {
  buildOpenCordDeepLink,
  buildOpenCordNotificationDeepLink,
  buildOpenCordRoutePath,
  displayOpenCordChannelName,
  formatOpenCordMeetingClock,
  formatOpenCordMeetingDay,
  normalizeOpenCordChannelName,
  openCordMeetingChannelLabel,
  parseOpenCordDeepLink,
  parseOpenCordNotificationDeepLink,
  parseOpenCordNotificationRoute,
  parseOpenCordNotificationRouteTarget,
  parseOpenCordRouteTarget,
  slugOpenCordTitle,
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

  it('round-trips notification tap route targets through OpenCord links', () => {
    const target = {
      kind: 'message',
      serverId: 'local-opencord',
      organizationId: 'org-1',
      spaceId: 'space-1',
      channelId: 'general',
      messageId: 'msg-1',
    } satisfies OpenCordRouteTarget

    const deepLink = buildOpenCordNotificationDeepLink(target)

    expect(deepLink).toBe(
      'opencord://notification?kind=message&serverId=local-opencord&organizationId=org-1&spaceId=space-1&channelId=general&messageId=msg-1',
    )
    expect(parseOpenCordNotificationDeepLink(deepLink)).toEqual(target)
    expect(
      parseOpenCordNotificationDeepLink(
        'https://chat.example.com/notification?kind=meeting&meetingId=meeting-1&serverId=local-opencord&spaceId=space-1&channelId=general',
      ),
    ).toEqual({
      kind: 'meeting',
      meetingId: 'meeting-1',
      serverId: 'local-opencord',
      spaceId: 'space-1',
      channelId: 'general',
    })
  })

  it('accepts only server, channel, message, and meeting targets for notifications', () => {
    expect(
      parseOpenCordNotificationRouteTarget({
        kind: 'server',
        serverId: 'local-opencord',
      }),
    ).toEqual({
      kind: 'server',
      serverId: 'local-opencord',
    })
    expect(
      parseOpenCordNotificationRouteTarget({
        kind: 'settings',
        panel: 'notifications',
      }),
    ).toBeNull()
    expect(parseOpenCordNotificationDeepLink('opencord://route?kind=message&channelId=general'))
      .toBeNull()
    expect(parseOpenCordNotificationDeepLink('opencord://notification?kind=message')).toBeNull()
  })

  it('validates notification route envelopes without accepting malformed targets', () => {
    expect(
      parseOpenCordNotificationRoute({
        id: 'notification-1',
        title: '#general',
        body: 'Mira: Standup is moving',
        receivedAt: '2026-06-25T00:00:00.000Z',
        target: {
          kind: 'channel',
          serverId: 'local-opencord',
          spaceId: 'space-1',
          channelId: 'general',
        },
      }),
    ).toEqual({
      id: 'notification-1',
      title: '#general',
      body: 'Mira: Standup is moving',
      receivedAt: '2026-06-25T00:00:00.000Z',
      target: {
        kind: 'channel',
        serverId: 'local-opencord',
        spaceId: 'space-1',
        channelId: 'general',
      },
    })
    expect(
      parseOpenCordNotificationRoute({
        id: 'notification-1',
        title: '#general',
        body: 'Mira: Standup is moving',
        receivedAt: '2026-06-25T00:00:00.000Z',
        target: {
          kind: 'developer',
          serverId: 'local-opencord',
          panel: 'bots',
        },
      }),
    ).toBeNull()
  })

  it('formats shared workspace labels without browser or native APIs', () => {
    expect(normalizeOpenCordChannelName(' Roadmap Review!! ')).toBe('roadmap-review')
    expect(normalizeOpenCordChannelName('---')).toBe('')
    expect(slugOpenCordTitle('Roadmap Review')).toBe('roadmap-review')
    expect(slugOpenCordTitle('???')).toBe('meeting')
    expect(displayOpenCordChannelName('office-hours')).toBe('Office Hours')
    expect(displayOpenCordChannelName('general')).toBe('General')
  })

  it('formats shared meeting labels for web and native clients', () => {
    const channels = [
      { id: 'general', kind: 'text' as const, name: 'general' },
      { id: 'standup', kind: 'voice' as const, name: 'standup' },
    ]

    expect(formatOpenCordMeetingDay('2026-06-25T10:00:00', 'en-US')).toBe('Jun 25')
    expect(
      formatOpenCordMeetingClock(
        '2026-06-25T10:00:00',
        '2026-06-25T10:30:00',
        'en-US',
      ),
    ).toMatch(/10:00\s*AM - 10:30\s*AM/)
    expect(formatOpenCordMeetingDay('not-a-date', 'en-US')).toBe('not-a-date')
    expect(formatOpenCordMeetingClock('bad-start', 'bad-end', 'en-US')).toBe(
      'bad-start - bad-end',
    )
    expect(openCordMeetingChannelLabel({ channelId: 'general' }, channels)).toBe('# General')
    expect(openCordMeetingChannelLabel({ channelId: 'standup' }, channels)).toBe('Voice Standup')
    expect(openCordMeetingChannelLabel({ channelId: 'missing' }, channels)).toBe('Workspace')
  })
})
