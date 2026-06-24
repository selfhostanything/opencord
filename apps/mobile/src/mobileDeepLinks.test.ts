import { describe, expect, it } from 'vitest'

import { mobileMeetingIdFromUrl, mobileNotificationRouteTargetFromUrl } from './mobileDeepLinks'

describe('mobile deep links', () => {
  it('extracts meeting ids from OpenCord custom scheme routes', () => {
    expect(mobileMeetingIdFromUrl('opencord://meeting/local-alpha-meeting')).toBe(
      'local-alpha-meeting',
    )
    expect(mobileMeetingIdFromUrl('opencord://meetings/019ef679-3187-7331-a2bd-aa8b5ade1e57')).toBe(
      '019ef679-3187-7331-a2bd-aa8b5ade1e57',
    )
    expect(mobileMeetingIdFromUrl('opencord://servers/local-opencord/meetings/mobile%20sync')).toBe(
      'mobile sync',
    )
  })

  it('extracts meeting ids from universal links and notification query payloads', () => {
    expect(mobileMeetingIdFromUrl('https://chat.example.com/meetings/local-alpha-meeting')).toBe(
      'local-alpha-meeting',
    )
    expect(mobileMeetingIdFromUrl('https://chat.example.com/notification?meeting_id=meeting-1')).toBe(
      'meeting-1',
    )
    expect(mobileMeetingIdFromUrl('https://chat.example.com/notification?meetingId=meeting-2')).toBe(
      'meeting-2',
    )
  })

  it('ignores non-meeting links', () => {
    expect(mobileMeetingIdFromUrl('opencord://media/leave')).toBeNull()
    expect(mobileMeetingIdFromUrl('not a url')).toBeNull()
  })

  it('extracts notification route targets for mobile tap routing', () => {
    expect(
      mobileNotificationRouteTargetFromUrl(
        'opencord://notification?kind=message&serverId=local-opencord&spaceId=space-1&channelId=general&messageId=msg-1',
      ),
    ).toEqual({
      kind: 'message',
      serverId: 'local-opencord',
      spaceId: 'space-1',
      channelId: 'general',
      messageId: 'msg-1',
    })
    expect(
      mobileNotificationRouteTargetFromUrl(
        'https://chat.example.com/notification?kind=meeting&meetingId=meeting-roadmap-review',
      ),
    ).toEqual({
      kind: 'meeting',
      meetingId: 'meeting-roadmap-review',
    })
    expect(mobileNotificationRouteTargetFromUrl('opencord://notification?kind=settings&panel=developer'))
      .toBeNull()
  })
})
