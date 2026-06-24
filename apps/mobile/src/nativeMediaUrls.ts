export type NativeMediaPlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos' | string

export function nativeLiveKitServerUrlForPlatform(
  serverUrl: string,
  platform: NativeMediaPlatform,
) {
  if (platform !== 'android' && platform !== 'ios') {
    return serverUrl
  }

  try {
    const parsedUrl = new URL(serverUrl)
    if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsedUrl.hostname)) {
      return serverUrl
    }

    parsedUrl.hostname = platform === 'android' ? '10.0.2.2' : '127.0.0.1'
    const normalizedUrl = parsedUrl.toString()
    return serverUrl.endsWith('/') ? normalizedUrl : normalizedUrl.replace(/\/$/, '')
  } catch {
    return serverUrl
  }
}
