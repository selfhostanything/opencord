export const DEVICE_SESSION_SECRET_GET_CHANNEL = 'opencord:device-session-secret:get'
export const DEVICE_SESSION_SECRET_SET_CHANNEL = 'opencord:device-session-secret:set'
export const DEVICE_SESSION_SECRET_REMOVE_CHANNEL = 'opencord:device-session-secret:remove'

const SECRET_KEY_PREFIX = 'opencord.deviceSession.secret:v1:'

export function isDeviceSessionSecretKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith(SECRET_KEY_PREFIX) &&
    value.length <= 512 &&
    !/[\r\n]/.test(value)
  )
}
