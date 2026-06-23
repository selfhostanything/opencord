import { describe, expect, it } from 'vitest'

import {
  buildMessageNotification,
  isMessageNotificationPayload,
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
})
