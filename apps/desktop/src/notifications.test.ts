import { describe, expect, it } from 'vitest'

import {
  buildMessageNotification,
  isMessageNotificationPayload,
  notificationClickRouteFromPayload,
  shouldShowMessageNotification,
} from './notifications'

describe('desktop notifications', () => {
  it('validates message notification payloads crossing the preload bridge', () => {
    expect(
      isMessageNotificationPayload({
        channelName: 'general',
        authorName: 'Mira',
        body: 'Release notes are ready',
        own: false,
        notificationLink:
          'opencord://notification?kind=message&serverId=local-opencord&spaceId=space-1&channelId=general&messageId=msg-1',
      }),
    ).toBe(true)
    expect(isMessageNotificationPayload({ channelName: 'general' })).toBe(false)
    expect(
      isMessageNotificationPayload({
        channelName: '',
        authorName: 'Mira',
        body: 'Release notes are ready',
        own: false,
      }),
    ).toBe(false)
    expect(
      isMessageNotificationPayload({
        channelName: 'general',
        authorName: 'Mira',
        body: 'Release notes are ready',
        own: false,
        notificationLink: 'https://example.com/not-a-notification',
      }),
    ).toBe(false)
  })

  it('only shows message notifications for backgrounded non-own messages', () => {
    expect(shouldShowMessageNotification({ isWindowFocused: false, own: false })).toBe(true)
    expect(shouldShowMessageNotification({ isWindowFocused: true, own: false })).toBe(false)
    expect(shouldShowMessageNotification({ isWindowFocused: false, own: true })).toBe(false)
  })

  it('builds concise native notification copy', () => {
    expect(
      buildMessageNotification({
        channelName: 'general',
        authorName: 'Mira',
        body: 'Release notes are ready',
        own: false,
      }),
    ).toEqual({
      title: '#general - Mira',
      body: 'Release notes are ready',
    })
  })

  it('truncates long notification bodies', () => {
    const copy = buildMessageNotification({
      channelName: 'general',
      authorName: 'Mira',
      body: 'x'.repeat(220),
      own: false,
    })

    expect(copy.body).toHaveLength(160)
    expect(copy.body.endsWith('...')).toBe(true)
  })

  it('maps optional notification click links to renderer routes', () => {
    expect(
      notificationClickRouteFromPayload({
        channelName: 'general',
        authorName: 'Mira',
        body: 'Release notes are ready',
        own: false,
        notificationLink:
          'opencord://notification?kind=message&serverId=local-opencord&spaceId=space-1&channelId=general&messageId=msg-1',
      }),
    ).toEqual({
      routePath: '/servers/local-opencord/spaces/space-1/channels/general?messageId=msg-1',
      target: {
        kind: 'message',
        serverId: 'local-opencord',
        spaceId: 'space-1',
        channelId: 'general',
        messageId: 'msg-1',
      },
    })
    expect(
      notificationClickRouteFromPayload({
        channelName: 'general',
        authorName: 'Mira',
        body: 'Release notes are ready',
        own: false,
      }),
    ).toBeNull()
  })
})
