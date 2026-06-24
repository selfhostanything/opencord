import type { MobileChannel, MobileScreen } from './mobileState'

export type MobileE2ELaunchConfig = {
  autoJoinMeeting: boolean
  autoJoinVoice: boolean
  commandUrl: string | null
  demoWorkspace: boolean
  email: string
  meetingId: string | null
  meetingTitle: string | null
  password: string
  preferredVoiceChannelName: string | null
  rememberDevice: boolean
  runId: string | null
  serverUrl: string
}

export type MobileE2ECommand = 'deaf' | 'leave' | 'mute'

export function normalizeMobileE2ELaunchConfig(value: unknown): MobileE2ELaunchConfig | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (candidate.enabled !== true) {
    return null
  }

  const serverUrl = trimmedString(candidate.serverUrl)
  const email = trimmedString(candidate.email)
  const password = typeof candidate.password === 'string' ? candidate.password : ''
  const demoWorkspace = candidate.demoWorkspace === true
  if (!serverUrl || !email || (!password && !demoWorkspace)) {
    return null
  }

  return {
    autoJoinMeeting: candidate.autoJoinMeeting === true,
    autoJoinVoice: candidate.autoJoinVoice === true,
    commandUrl: trimmedString(candidate.commandUrl),
    demoWorkspace,
    email,
    meetingId: trimmedString(candidate.meetingId),
    meetingTitle: trimmedString(candidate.meetingTitle),
    password,
    preferredVoiceChannelName: trimmedString(candidate.preferredVoiceChannelName),
    rememberDevice: candidate.rememberDevice !== false,
    runId: trimmedString(candidate.runId),
    serverUrl,
  }
}

export function shouldAutoJoinMobileVoice({
  autoJoinStarted,
  channels,
  config,
  screen,
  sessionToken,
}: {
  autoJoinStarted: boolean
  channels: MobileChannel[]
  config: MobileE2ELaunchConfig | null
  screen: MobileScreen
  sessionToken: string | null
}) {
  if (
    autoJoinStarted ||
    !config?.autoJoinVoice ||
    screen !== 'channels' ||
    !sessionToken
  ) {
    return null
  }

  const preferred = config.preferredVoiceChannelName
    ? channels.find(
        (channel) => channel.kind === 'voice' && channel.name === config.preferredVoiceChannelName,
      )
    : null
  const fallback = channels.find((channel) => channel.kind === 'voice')

  return preferred?.id ?? fallback?.id ?? null
}

export function mobileE2ECommandFromUrl(url: string): MobileE2ECommand | null {
  const prefix = 'opencord-e2e://'
  const normalizedUrl = url.trim().toLowerCase()
  if (!normalizedUrl.startsWith(prefix)) {
    return null
  }

  const route = normalizedUrl
    .slice(prefix.length)
    .split(/[?#]/, 1)[0]
    ?.replace(/^\/+/, '')

  switch (route) {
    case 'media/mute':
      return 'mute'
    case 'media/deaf':
      return 'deaf'
    case 'media/leave':
      return 'leave'
    default:
      return null
  }
}

export function normalizeMobileE2ECommand(value: unknown): MobileE2ECommand | null {
  switch (value) {
    case 'mute':
    case 'deaf':
    case 'leave':
      return value
    default:
      return null
  }
}

export function mobileE2EStateUrl(commandUrl: string | null) {
  if (!commandUrl) {
    return null
  }

  try {
    const url = new URL(commandUrl.trim())
    url.pathname = '/state'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function trimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
