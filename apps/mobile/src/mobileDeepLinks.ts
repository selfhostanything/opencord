import {
  parseOpenCordNotificationDeepLink,
  type OpenCordNotificationRouteTarget,
} from '@opencord/client-contracts'

export function mobileNotificationRouteTargetFromUrl(
  value: string,
): OpenCordNotificationRouteTarget | null {
  return parseOpenCordNotificationDeepLink(value)
}

export function mobileMeetingIdFromUrl(value: string) {
  const parsed = parseUrl(value)
  if (!parsed) {
    return null
  }

  const queryMeetingId =
    parsed.searchParams.get('meeting_id') ?? parsed.searchParams.get('meetingId')
  if (queryMeetingId?.trim()) {
    return queryMeetingId.trim()
  }

  const parts = [parsed.hostname, ...parsed.pathname.split('/')]
    .map((part) => decodeURIComponent(part).trim())
    .filter(Boolean)
  const meetingIndex = parts.findIndex((part) => part === 'meeting' || part === 'meetings')
  return meetingIndex >= 0 ? parts[meetingIndex + 1] ?? null : null
}

function parseUrl(value: string) {
  try {
    return new URL(value.trim())
  } catch {
    return null
  }
}
