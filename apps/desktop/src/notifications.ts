import { parseDesktopNotificationRoute, type DesktopDeepLinkRoute } from './deepLinks'

export const MESSAGE_NOTIFICATION_CHANNEL = 'opencord:notification:message'

export type MessageNotificationPayload = {
  channelName: string
  authorName: string
  body: string
  own: boolean
  notificationLink?: string
}

export type MessageNotificationDecision = {
  isWindowFocused: boolean
  own: boolean
}

export type NativeNotificationCopy = {
  title: string
  body: string
}

const maxNotificationBodyLength = 160

export function isMessageNotificationPayload(value: unknown): value is MessageNotificationPayload {
  if (!isObject(value)) {
    return false
  }

  return (
    isNonEmptyString(value.channelName) &&
    isNonEmptyString(value.authorName) &&
    isNonEmptyString(value.body) &&
    typeof value.own === 'boolean' &&
    optionalNotificationLinkIsValid(value.notificationLink)
  )
}

export function shouldShowMessageNotification({
  isWindowFocused,
  own,
}: MessageNotificationDecision) {
  return !isWindowFocused && !own
}

export function buildMessageNotification(
  payload: MessageNotificationPayload,
): NativeNotificationCopy {
  return {
    title: `#${payload.channelName} - ${payload.authorName}`,
    body: truncate(payload.body.trim(), maxNotificationBodyLength),
  }
}

export function notificationClickRouteFromPayload(
  payload: MessageNotificationPayload,
): DesktopDeepLinkRoute | null {
  return payload.notificationLink
    ? parseDesktopNotificationRoute(payload.notificationLink)
    : null
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalNotificationLinkIsValid(value: unknown) {
  return (
    value === undefined ||
    (typeof value === 'string' && parseDesktopNotificationRoute(value) !== null)
  )
}
