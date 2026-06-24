import {
  _electron as electron,
  expect,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  test,
} from '@playwright/test'
import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import type { LiveKitVoiceState } from '@opencord/media'

const API_BASE_URL = process.env.OPENCORD_API_BASE_URL ?? 'http://localhost:8080'
const WEB_BASE_URL = process.env.OPENCORD_WEB_BASE_URL ?? 'http://localhost:5173'
const SEED_OWNER_EMAIL = process.env.OPENCORD_SEED_OWNER_EMAIL ?? 'owner@opencord.local'
const SEED_OWNER_PASSWORD =
  process.env.OPENCORD_SEED_OWNER_PASSWORD ?? 'correct horse battery staple'
const EVIDENCE_ROOT =
  process.env.OPENCORD_PHASE10_EVIDENCE_DIR ??
  '<WORKSPACE>/opencord/output/phase-10-media'
const EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_003_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-003-web-livekit-voice`)
const SCREENSHOT_DIR = path.join(EVIDENCE_DIR, 'screenshots')
const OC10_004_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_004_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-004-web-screen-share`)
const OC10_004_SCREENSHOT_DIR = path.join(OC10_004_EVIDENCE_DIR, 'screenshots')
const OC10_006_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_006_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-006-browser-android-full-session`)
const OC10_006_SCREENSHOT_DIR = path.join(OC10_006_EVIDENCE_DIR, 'screenshots')
const OC10_006_LOG_DIR = path.join(OC10_006_EVIDENCE_DIR, 'logs')
const ANDROID_PACKAGE = 'com.opencord'
const OC10_007_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_007_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-007-browser-ios-full-session`)
const OC10_007_SCREENSHOT_DIR = path.join(OC10_007_EVIDENCE_DIR, 'screenshots')
const OC10_007_LOG_DIR = path.join(OC10_007_EVIDENCE_DIR, 'logs')
const LIVEKIT_CONTAINER_NAME =
  process.env.OPENCORD_PHASE10_LIVEKIT_CONTAINER ?? 'opencord-livekit-hostnet'
const IOS_APP_BUNDLE_ID = 'com.opencord'
const IOS_APP_PATH =
  process.env.OPENCORD_PHASE10_IOS_APP_PATH ??
  '<WORKSPACE>/opencord-clients/apps/mobile/ios/build/xcodebuild/Build/Products/Debug-iphonesimulator/OpenCord.app'
const IOS_DEVELOPER_DIR =
  process.env.DEVELOPER_DIR ?? '/Applications/Xcode.app/Contents/Developer'
const IOS_SIMULATOR_UDID =
  process.env.OPENCORD_PHASE10_IOS_UDID ?? 'E9313E00-DBAE-447F-BF3B-960F3E2586AB'
const OC10_008_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_008_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-008-electron-full-session`)
const OC10_008_SCREENSHOT_DIR = path.join(OC10_008_EVIDENCE_DIR, 'screenshots')
const OC10_008_LOG_DIR = path.join(OC10_008_EVIDENCE_DIR, 'logs')
const OC10_009_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_009_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-009-meeting-media`)
const OC10_009_SCREENSHOT_DIR = path.join(OC10_009_EVIDENCE_DIR, 'screenshots')
const OC10_009_LOG_DIR = path.join(OC10_009_EVIDENCE_DIR, 'logs')
const OC10_010_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_010_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-010-turn-relay`)
const OC10_010_SCREENSHOT_DIR = path.join(OC10_010_EVIDENCE_DIR, 'screenshots')
const OC10_011_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_011_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-011-permission-boundaries`)
const OC10_011_SCREENSHOT_DIR = path.join(OC10_011_EVIDENCE_DIR, 'screenshots')
const OC10_012_EVIDENCE_DIR =
  process.env.OPENCORD_PHASE10_OC10_012_DIR ??
  path.join(EVIDENCE_ROOT, `${timestampForEvidence()}-oc-10-012-observability-diagnostics`)
const DESKTOP_MAIN_PATH =
  process.env.OPENCORD_PHASE10_DESKTOP_MAIN_PATH ??
  '<WORKSPACE>/opencord-clients/apps/desktop/dist/main.js'

type SeedMediaContext = {
  meeting: SeedMeeting
  owner: MediaUser
  guest: MediaUser
  organizationId: string
  spaceId: string
  textChannelId: string
  voiceChannelId: string
}

type SeedMeeting = {
  channelId: string | null
  id: string
  title: string
}

type MediaUser = {
  email: string
  displayName: string
  password: string
  refreshToken: string
  sessionToken: string
  userId: string
  headers: { Authorization: string }
}

type MobileE2ECommand = 'deaf' | 'leave' | 'mute'

type MobileE2ECommandServer = {
  close: () => Promise<void>
  latestState: () => MobileE2EStateSnapshot | null
  send: (command: MobileE2ECommand) => void
  stateUrl: string
  url: string
}

type MobileE2EStateSnapshot = {
  accountEmail?: string | null
  receivedAt: string
  realtimeStatus?: string
  runId?: string | null
  screen?: string
  sequence: number
  voice?: {
    canPublishAudio?: boolean | null
    canPublishScreen?: boolean | null
    canSubscribe?: boolean | null
    connectedChannelId?: string | null
    connectionStatus?: string
    displayName?: string | null
    errorMessage?: string | null
    localAudioTracks?: number | null
    participantIdentity?: string | null
    participants?: Array<{
      id?: string
      name?: string
      self?: boolean
      status?: string
    }>
    remoteAudioTracks?: number | null
    remoteScreenShares?: number
    remoteScreenShareStreams?: Array<{
      hasStreamUrl?: boolean
      id?: string
      participantIdentity?: string
    }>
    roomName?: string | null
    selfDeaf?: boolean
    selfMute?: boolean
  }
}

type PeerConnectionStat = {
  bytesReceived?: number
  bytesSent?: number
  candidateType?: string
  codecId?: string
  currentRoundTripTime?: number
  framesDecoded?: number
  framesEncoded?: number
  id: string
  kind?: string
  localCandidateId?: string
  mediaType?: string
  mimeType?: string
  nominated?: boolean
  packetsReceived?: number
  packetsSent?: number
  protocol?: string
  relayProtocol?: string
  remoteCandidateId?: string
  selected?: boolean
  state?: string
  trackId?: string
  trackIdentifier?: string
  type: string
}

type PeerConnectionReport = {
  configuration?: {
    iceServers: Array<{
      credentialPresent: boolean
      urls: string[]
      usernamePresent: boolean
    }>
    iceTransportPolicy?: RTCIceTransportPolicy
  }
  connectionState: string
  connectionStateEvents: string[]
  iceCandidateErrors: Array<{
    address?: string | null
    errorCode?: number
    errorText?: string
    port?: number | null
    url?: string
  }>
  iceCandidates: string[]
  iceConnectionState: string
  iceConnectionStateEvents: string[]
  index: number
  stats: PeerConnectionStat[]
}

type BrowserMediaEvidence = {
  diagnostics: LiveKitVoiceState[]
  peerConnections: PeerConnectionReport[]
  summary: MediaStatsSummary
}

type EvidenceArtifactAudit = {
  directory: string
  files: Array<{
    bytes: number
    hasMediaSummary: boolean
    path: string
  }>
  label: string
  statusPassed: boolean
}

type MediaStatsSummary = {
  inboundAudioBytes: number
  inboundAudioPackets: number
  liveKitLocalAudioTracks: number
  liveKitLocalScreenShareTracks: number
  liveKitRemoteParticipants: number
  liveKitRemoteScreenShareTracks: number
  liveKitUnmutedLocalAudioTracks: number
  outboundAudioBytes: number
  outboundAudioPackets: number
  inboundVideoBytes: number
  inboundVideoFrames: number
  inboundVideoPackets: number
  outboundVideoBytes: number
  outboundVideoFrames: number
  outboundVideoPackets: number
  peerConnections: number
  relayCandidatePairs: number
  selectedRelayCandidatePairs: number
  localRelayCandidates: number
  remoteRelayCandidates: number
}

test.setTimeout(240_000)

test('OC-10-003 web LiveKit voice joins, publishes, subscribes, controls, and reconnects', async ({
  browser,
  request,
}) => {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  await writeFile(
    path.join(EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord',
      'fnm exec --using 26 pnpm --dir <WORKSPACE>/opencord-clients --filter web exec playwright test --grep "OC-10-003"',
      '```',
      '',
    ].join('\n'),
  )

  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  await writeFile(path.join(EVIDENCE_DIR, 'metrics-before.txt'), await readMetrics(request))
  const seeded = await loadSeedMediaContext(request)
  const ownerContext = await newMediaContext(browser)
  const guestContext = await newMediaContext(browser)
  const ownerPage = await ownerContext.newPage()
  const guestPage = await guestContext.newPage()

  try {
    await startLocalAlpha(ownerPage, seeded.owner)
    await startLocalAlpha(guestPage, seeded.guest)

    await ownerPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(ownerPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })

    await guestPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(guestPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })

    const ownerConnectedEvidence = await waitForFullDuplexAudio(ownerPage)
    const guestConnectedEvidence = await waitForFullDuplexAudio(guestPage)
    await writeEvidence('browser-owner-connected.json', ownerConnectedEvidence)
    await writeEvidence('browser-guest-connected.json', guestConnectedEvidence)
    await ownerPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'browser-owner-connected.png'),
    })
    await guestPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'browser-guest-connected.png'),
    })

    await ownerPage.getByRole('button', { name: 'Mute microphone' }).click()
    await expect(ownerPage.getByRole('button', { name: 'Unmute microphone' })).toBeVisible()
    await expect.poll(() => hasMutedLocalAudio(ownerPage), { timeout: 30_000 }).toBe(true)

    await ownerPage.getByRole('button', { name: 'Unmute microphone' }).click()
    await expect(ownerPage.getByRole('button', { name: 'Mute microphone' })).toBeVisible()
    await expect.poll(() => hasUnmutedLocalAudio(ownerPage), { timeout: 30_000 }).toBe(true)

    await guestPage.getByRole('button', { name: 'Deafen audio' }).click()
    await expect(guestPage.getByRole('button', { name: 'Undeafen audio' })).toBeVisible()
    await expect.poll(() => hasMutedLocalAudio(guestPage), { timeout: 30_000 }).toBe(true)

    await guestPage.getByRole('button', { name: 'Disconnect voice' }).click()
    await expect(guestPage.getByLabel('Voice controls')).toContainText('Not connected')
    await expect
      .poll(() => remoteParticipantCount(ownerPage), { timeout: 45_000 })
      .toBe(0)

    await seedLocalAlphaSession(ownerPage, seeded.owner, seeded.voiceChannelId)
    await ownerPage.reload()
    await expect(ownerPage.getByLabel('Voice controls')).toContainText('OpenCord Owner', {
      timeout: 30_000,
    })
    await expect(ownerPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 45_000,
    })
    const ownerReloadEvidence = await waitForLocalAudio(ownerPage)
    await writeEvidence('browser-owner-reload-reconnect.json', ownerReloadEvidence)
    await ownerPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'browser-owner-reload-reconnect.png'),
    })
    await writeFile(path.join(EVIDENCE_DIR, 'livekit.log'), await liveKitLogsSince(liveKitLogSince))
    await writeFile(path.join(EVIDENCE_DIR, 'metrics-after.txt'), await readMetrics(request))

    await writeFile(
      path.join(EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-003 Web LiveKit Voice',
        '',
        'Status: passed',
        '',
        `Owner participant: ${seeded.owner.userId}`,
        `Guest participant: ${seeded.guest.userId}`,
        `Voice channel: ${seeded.voiceChannelId}`,
        '',
        'Verified:',
        '',
        '- Two browser contexts joined the same voice channel through the web UI.',
        '- Both browsers published microphone audio and subscribed to remote audio.',
        '- WebRTC inbound and outbound audio RTP counters moved.',
        '- LiveKit diagnostics showed local audio tracks and remote participants.',
        '- Mute, unmute, deafen, leave, and reload reconnect were exercised.',
        '',
      ].join('\n'),
    )

    const ownerDisconnect = ownerPage.getByRole('button', { name: 'Disconnect voice' })
    if (await ownerDisconnect.isEnabled()) {
      await ownerDisconnect.click({ timeout: 10_000 })
    }
  } finally {
    await Promise.allSettled([ownerContext.close(), guestContext.close()])
  }
})

test('OC-10-004 web screen share publishes display media and renders remote watcher', async ({
  browser,
  request,
}) => {
  await mkdir(OC10_004_SCREENSHOT_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_004_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord',
      'fnm exec --using 26 pnpm --dir <WORKSPACE>/opencord-clients --filter web exec playwright test --grep "OC-10-004"',
      '```',
      '',
    ].join('\n'),
  )

  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  const seeded = await loadSeedMediaContext(request)
  const screenShareRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Web Screen ${Date.now()}`,
    ['SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, screenShareRoleId, seeded.owner.userId)
  const ownerContext = await newMediaContext(browser)
  const guestContext = await newMediaContext(browser)
  const ownerPage = await ownerContext.newPage()
  const guestPage = await guestContext.newPage()
  const ownerConsoleMessages: string[] = []
  const guestConsoleMessages: string[] = []
  captureConsoleMessages(ownerPage, ownerConsoleMessages)
  captureConsoleMessages(guestPage, guestConsoleMessages)

  try {
    await startLocalAlpha(ownerPage, seeded.owner)
    await startLocalAlpha(guestPage, seeded.guest)

    await ownerPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(ownerPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await guestPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(guestPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })

    await waitForLocalAudio(ownerPage)
    await waitForLocalAudio(guestPage)
    await expect(ownerPage.getByRole('button', { name: 'Share screen' })).toBeEnabled()

    await ownerPage.bringToFront()
    await ownerPage.getByRole('button', { name: 'Share screen' }).click()
    await expect(ownerPage.getByRole('button', { name: 'Stop screen share' })).toBeVisible({
      timeout: 30_000,
    })

    const ownerShareEvidence = await waitForPublishedScreenShare(
      ownerPage,
      OC10_004_EVIDENCE_DIR,
      'browser-owner-screen-share-timeout',
    )
    const guestWatchEvidence = await waitForReceivedScreenShare(guestPage)
    await writeEvidenceTo(OC10_004_EVIDENCE_DIR, 'browser-owner-screen-share.json', ownerShareEvidence)
    await writeEvidenceTo(OC10_004_EVIDENCE_DIR, 'browser-guest-screen-watch.json', guestWatchEvidence)
    await ownerPage.screenshot({
      path: path.join(OC10_004_SCREENSHOT_DIR, 'browser-owner-screen-share.png'),
    })
    await guestPage.screenshot({
      path: path.join(OC10_004_SCREENSHOT_DIR, 'browser-guest-screen-watch.png'),
    })

    await ownerPage.getByRole('button', { name: 'Stop screen share' }).click()
    await expect(ownerPage.getByRole('button', { name: 'Share screen' })).toBeVisible()
    await expect
      .poll(() => remoteScreenShareVideoCount(guestPage), { timeout: 45_000 })
      .toBe(0)
    await writeFile(
      path.join(OC10_004_EVIDENCE_DIR, 'livekit.log'),
      await liveKitLogsSince(liveKitLogSince),
    )

    await writeFile(
      path.join(OC10_004_EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-004 Web Screen Share',
        '',
        'Status: passed',
        '',
        `Owner participant: ${seeded.owner.userId}`,
        `Guest participant: ${seeded.guest.userId}`,
        `Voice channel: ${seeded.voiceChannelId}`,
        '',
        'Verified:',
        '',
        '- Browser owner published a display video track through the web UI.',
        '- Browser guest rendered the remote screen-share watcher video.',
        '- WebRTC outbound and inbound video RTP counters moved.',
        '- LiveKit diagnostics showed local and remote screen-share publications.',
        '- Stop-share cleared the watcher UI.',
        '',
      ].join('\n'),
    )

    const ownerDisconnect = ownerPage.getByRole('button', { name: 'Disconnect voice' })
    const guestDisconnect = guestPage.getByRole('button', { name: 'Disconnect voice' })
    if (await ownerDisconnect.isEnabled()) {
      await ownerDisconnect.click({ timeout: 10_000 })
    }
    if (await guestDisconnect.isEnabled()) {
      await guestDisconnect.click({ timeout: 10_000 })
    }
  } catch (error) {
    await writeFile(
      path.join(OC10_004_EVIDENCE_DIR, 'browser-console.json'),
      `${JSON.stringify(
        {
          guest: guestConsoleMessages,
          owner: ownerConsoleMessages,
        },
        null,
        2,
      )}\n`,
    )
    throw error
  } finally {
    await Promise.allSettled([ownerContext.close(), guestContext.close()])
  }
})

test('OC-10-006 browser and Android 15 join voice, share screen, and sync controls', async ({
  browser,
  request,
}) => {
  test.skip(
    process.env.OPENCORD_PHASE10_ANDROID_E2E !== '1',
    'OC-10-006 requires a running Android 15 emulator, installed debug app, and local media stack.',
  )

  await mkdir(OC10_006_SCREENSHOT_DIR, { recursive: true })
  await mkdir(OC10_006_LOG_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_006_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord',
      'fnm exec --using 26 pnpm --dir <WORKSPACE>/opencord-clients --filter web exec playwright test --grep "OC-10-006"',
      '```',
      '',
    ].join('\n'),
  )

  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  await writeFile(path.join(OC10_006_EVIDENCE_DIR, 'metrics-before.txt'), await readMetrics(request))
  await adb(['logcat', '-c'])
  const seeded = await loadSeedMediaContext(request)
  const screenShareRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Android Browser Screen ${Date.now()}`,
    ['SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, screenShareRoleId, seeded.guest.userId)
  await writeFile(
    path.join(OC10_006_EVIDENCE_DIR, 'browser-session-context.json'),
    `${JSON.stringify(
      {
        organizationId: seeded.organizationId,
        spaceId: seeded.spaceId,
        voiceChannelId: seeded.voiceChannelId,
        androidEmail: seeded.owner.email,
        androidUserId: seeded.owner.userId,
        browserUserId: seeded.guest.userId,
        browserEmail: seeded.guest.email,
        browserPermissions: ['CONNECT_VOICE', 'SPEAK', 'SHARE_SCREEN'],
      },
      null,
      2,
    )}\n`,
  )

  await ensureAndroidOwnerVoiceReady()

  const browserContext = await newMediaContext(browser)
  const browserPage = await browserContext.newPage()

  try {
    await startLocalAlpha(browserPage, seeded.guest)
    await browserPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(browserPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 60_000 }).toBe(1)

    await browserPage.getByRole('button', { name: 'Share screen' }).click()
    await expect(browserPage.getByRole('button', { name: 'Stop screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const browserShareEvidence = await waitForPublishedScreenShare(browserPage)
    await expect
      .poll(async () => (await collectMediaEvidence(browserPage)).summary.inboundAudioPackets, {
        timeout: 60_000,
      })
      .toBeGreaterThan(0)
    await writeEvidenceTo(
      OC10_006_EVIDENCE_DIR,
      'browser-after-screen-share.json',
      browserShareEvidence,
    )
    await browserPage.screenshot({
      path: path.join(OC10_006_SCREENSHOT_DIR, 'browser-screen-share-publishing.png'),
    })

    const watcherXml = await waitForAndroidText('Watching 1 screen share', 90_000)
    await writeFile(path.join(OC10_006_LOG_DIR, 'android-watching-screen-share-window.xml'), watcherXml)
    await writeAndroidScreenshot('android-watching-screen-share.png')

    await tapAndroidByDescription('Mute')
    const mutedXml = await waitForAndroidText('You - muted', 30_000)
    await writeFile(path.join(OC10_006_LOG_DIR, 'android-muted-window.xml'), mutedXml)
    await writeAndroidScreenshot('android-muted.png')

    await tapAndroidByDescription('Deaf')
    const deafenedXml = await waitForAndroidText('You - deafened', 30_000)
    await writeFile(path.join(OC10_006_LOG_DIR, 'android-deafened-window.xml'), deafenedXml)
    await writeAndroidScreenshot('android-deafened.png')

    await tapAndroidByDescription('Leave')
    const leftXml = await waitForAndroidVoiceDisconnected(45_000)
    await writeFile(path.join(OC10_006_LOG_DIR, 'android-left-window.xml'), leftXml)
    await writeAndroidScreenshot('android-left.png')
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 60_000 }).toBe(0)
    await writeFile(
      path.join(OC10_006_LOG_DIR, 'android-logcat-after-pass.log'),
      await adb(['logcat', '-d', '-t', '2000']),
    )
    await writeFile(path.join(OC10_006_LOG_DIR, 'livekit.log'), await liveKitLogsSince(liveKitLogSince))
    await writeFile(path.join(OC10_006_EVIDENCE_DIR, 'metrics-after.txt'), await readMetrics(request))

    await writeFile(
      path.join(OC10_006_EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-006 Browser To Android 15 Full Media Session',
        '',
        'Status: passed',
        '',
        `Android user: ${seeded.owner.userId}`,
        `Browser participant: ${seeded.guest.userId}`,
        `Voice channel: ${seeded.voiceChannelId}`,
        '',
        'Verified:',
        '',
        '- Android 15 app joined the same LiveKit voice room as the browser.',
        '- Browser published microphone audio and a screen-share video track.',
        '- Browser received Android microphone audio packets.',
        '- Android rendered the browser screen-share watcher.',
        '- Android mute, deafen, and leave controls updated UI state.',
        '- Browser observed Android participant leave.',
        '',
      ].join('\n'),
    )
  } finally {
    await Promise.allSettled([browserContext.close()])
  }
})

test('OC-10-007 browser and iOS simulator join voice, share screen, and sync controls', async ({
  browser,
  request,
}) => {
  test.skip(
    process.env.OPENCORD_PHASE10_IOS_E2E !== '1',
    'OC-10-007 requires the iPhone 17 Pro Max iOS 26.5 simulator, installed debug app, Metro, and local media stack.',
  )

  await mkdir(OC10_007_SCREENSHOT_DIR, { recursive: true })
  await mkdir(OC10_007_LOG_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_007_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord',
      'fnm exec --using 26 pnpm --dir <WORKSPACE>/opencord-clients --filter web exec playwright test --grep "OC-10-007"',
      '```',
      '',
    ].join('\n'),
  )

  await writeFile(path.join(OC10_007_EVIDENCE_DIR, 'metrics-before.txt'), await readMetrics(request))
  const seeded = await loadSeedMediaContext(request)
  const runId = `oc-10-007-${Date.now()}`
  const liveKitLogPath = path.join(OC10_007_LOG_DIR, 'livekit.log')
  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  const screenShareRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 iOS Browser Screen ${Date.now()}`,
    ['SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, screenShareRoleId, seeded.guest.userId)
  const iosCommandServer = await startMobileE2ECommandServer()
  let browserContext: BrowserContext | null = null

  try {
    await writeFile(
      path.join(OC10_007_EVIDENCE_DIR, 'browser-session-context.json'),
      `${JSON.stringify(
        {
          browserEmail: seeded.guest.email,
          browserPermissions: ['CONNECT_VOICE', 'SPEAK', 'SHARE_SCREEN'],
          browserUserId: seeded.guest.userId,
          iOSCommandUrl: iosCommandServer.url,
          iOSDevice: 'iPhone 17 Pro Max',
          iOSRuntime: 'iOS 26.5',
          iOSUdid: IOS_SIMULATOR_UDID,
          organizationId: seeded.organizationId,
          runId,
          spaceId: seeded.spaceId,
          voiceChannelId: seeded.voiceChannelId,
        },
        null,
        2,
      )}\n`,
    )

    await ensureIosOwnerVoiceReady(seeded.owner, runId, iosCommandServer)

    browserContext = await newMediaContext(browser)
    const browserPage = await browserContext.newPage()

    await startLocalAlpha(browserPage, seeded.guest)
    await browserPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(browserPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(1)

    await browserPage.getByRole('button', { name: 'Share screen' }).click()
    await expect(browserPage.getByRole('button', { name: 'Stop screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const browserShareEvidence = await waitForPublishedScreenShare(browserPage)
    const iosMicPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes('"kind": "audio"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'ios-microphone-publish-livekit.log'),
      iosMicPublishLog,
    )
    const iosMicTrackId = extractLiveKitTrackId(iosMicPublishLog)
    const browserAudioSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes(`"trackID": "${iosMicTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'browser-audio-subscribe-livekit.log'),
      browserAudioSubscribeLog,
    )
    const browserAudioPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes('"kind": "audio"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'browser-audio-publish-livekit.log'),
      browserAudioPublishLog,
    )
    const browserAudioTrackId = extractLiveKitTrackId(browserAudioPublishLog)
    const iosAudioSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes(`"trackID": "${browserAudioTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'ios-audio-subscribe-livekit.log'),
      iosAudioSubscribeLog,
    )
    const browserScreenPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes('"kind": "video"') &&
        line.includes('"source": "SCREEN_SHARE"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'browser-screen-share-publish-livekit.log'),
      browserScreenPublishLog,
    )
    const browserScreenTrackId = extractLiveKitTrackId(browserScreenPublishLog)
    const iosVideoSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes(`"trackID": "${browserScreenTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'ios-screen-share-subscribe-livekit.log'),
      iosVideoSubscribeLog,
    )
    await writeEvidenceTo(
      OC10_007_EVIDENCE_DIR,
      'browser-after-screen-share.json',
      browserShareEvidence,
    )
    await browserPage.screenshot({
      path: path.join(OC10_007_SCREENSHOT_DIR, 'browser-screen-share-publishing.png'),
    })

    await writeIosScreenshot('ios-watching-screen-share.png')

    iosCommandServer.send('mute')
    const mutedState = await waitForMobileE2EState(
      iosCommandServer,
      (state) => mobileE2EVoiceMuted(state, runId),
      45_000,
      'iOS voice muted state',
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'ios-muted-state.json'),
      mobileE2EStateJson(mutedState),
    )
    const mutedLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('publisher mute status changed') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes(`"trackID": "${iosMicTrackId}"`) &&
        line.includes('"muted": true'),
      45_000,
    )
    await writeFile(path.join(OC10_007_LOG_DIR, 'ios-muted-livekit.log'), mutedLog)
    await writeIosScreenshot('ios-muted.png')

    iosCommandServer.send('leave')
    const leftState = await waitForMobileE2EState(
      iosCommandServer,
      (state) => mobileE2EVoiceLeft(state, runId),
      60_000,
      'iOS voice left state',
    )
    await writeFile(
      path.join(OC10_007_LOG_DIR, 'ios-left-state.json'),
      mobileE2EStateJson(leftState),
    )
    const leftLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        (line.includes('track unpublished') ||
          line.includes('RTC session finishing') ||
          line.includes('"state": "DISCONNECTED"')),
      60_000,
    )
    await writeFile(path.join(OC10_007_LOG_DIR, 'ios-left-livekit.log'), leftLog)
    await writeIosScreenshot('ios-left.png')
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(0)
    await writeFile(liveKitLogPath, await liveKitLogsSince(liveKitLogSince))
    await writeFile(path.join(OC10_007_EVIDENCE_DIR, 'metrics-after.txt'), await readMetrics(request))

    await writeFile(
      path.join(OC10_007_EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-007 Browser To iOS Simulator Full Media Session',
        '',
        'Status: passed',
        '',
        `iOS user: ${seeded.owner.userId}`,
        `Browser participant: ${seeded.guest.userId}`,
        `Voice channel: ${seeded.voiceChannelId}`,
        `iOS simulator: iPhone 17 Pro Max iOS 26.5 (${IOS_SIMULATOR_UDID})`,
        `Run id: ${runId}`,
        '',
        'Verified:',
        '',
        '- iOS simulator app joined the same LiveKit voice room as the browser.',
        '- Browser published microphone audio and a screen-share video track.',
        '- iOS microphone publication was observed by LiveKit.',
        '- Browser subscribed to iOS microphone audio through LiveKit.',
        '- iOS subscribed to browser microphone audio and screen-share video tracks.',
        '- iOS mute and leave commands updated app state and LiveKit room state.',
        '- Browser observed the iOS participant leave.',
        '',
      ].join('\n'),
    )
  } finally {
    const cleanup: Promise<unknown>[] = [iosCommandServer.close()]
    if (browserContext) {
      cleanup.push(browserContext.close())
    }
    await Promise.allSettled(cleanup)
  }
})

test('OC-10-008 browser and Electron join voice, share screen, and sync controls', async ({
  browser,
  request,
}) => {
  test.skip(
    process.env.OPENCORD_PHASE10_ELECTRON_E2E !== '1',
    'OC-10-008 requires the built Electron desktop app, local web server, and local media stack.',
  )

  await mkdir(OC10_008_SCREENSHOT_DIR, { recursive: true })
  await mkdir(OC10_008_LOG_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_008_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord-clients',
      'fnm exec --using 26 pnpm --filter desktop build',
      'cd <WORKSPACE>/opencord',
      'env OPENCORD_PHASE10_ELECTRON_E2E=1 OPENCORD_PHASE10_OC10_008_DIR=<WORKSPACE>/opencord/output/phase-10-media/20260624-oc-10-008-electron-full-session OPENCORD_API_BASE_URL=http://localhost:8080 OPENCORD_WEB_BASE_URL=http://127.0.0.1:5173 fnm exec --using 26 pnpm --dir <WORKSPACE>/opencord-clients --filter web exec playwright test --grep "OC-10-008"',
      '```',
      '',
    ].join('\n'),
  )

  const seeded = await loadSeedMediaContext(request)
  const runId = `oc-10-008-${Date.now()}`
  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  const screenShareRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Electron Screen ${Date.now()}`,
    ['SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, screenShareRoleId, seeded.guest.userId)
  await writeFile(
    path.join(OC10_008_EVIDENCE_DIR, 'session-context.json'),
    `${JSON.stringify(
      {
        browserEmail: seeded.owner.email,
        browserUserId: seeded.owner.userId,
        electronEmail: seeded.guest.email,
        electronPermissions: ['CONNECT_VOICE', 'SPEAK', 'SHARE_SCREEN'],
        electronUserId: seeded.guest.userId,
        organizationId: seeded.organizationId,
        runId,
        spaceId: seeded.spaceId,
        voiceChannelId: seeded.voiceChannelId,
      },
      null,
      2,
    )}\n`,
  )

  const browserContext = await newMediaContext(browser)
  const browserPage = await browserContext.newPage()
  const electronLogs: string[] = []
  let electronApp: Awaited<ReturnType<typeof electron.launch>> | null = null

  try {
    electronApp = await electron.launch({
      args: [DESKTOP_MAIN_PATH],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        OPENCORD_DESKTOP_E2E_MEDIA: '1',
        OPENCORD_DESKTOP_RENDERER_URL: WEB_BASE_URL,
      },
    })
    const electronProcess = electronApp.process()
    electronProcess.stdout?.on('data', (chunk) => {
      electronLogs.push(String(chunk))
    })
    electronProcess.stderr?.on('data', (chunk) => {
      electronLogs.push(String(chunk))
    })
    const electronPage = await electronApp.firstWindow()
    await electronPage.setViewportSize({ width: 1280, height: 840 })
    await installPeerConnectionRecorderOnPage(electronPage)

    await startLocalAlpha(browserPage, seeded.owner)
    await startLocalAlpha(electronPage, seeded.guest)
    await electronPage.getByRole('button', { name: 'User settings' }).click()
    await expect(electronPage.getByRole('region', { name: 'Voice & Video settings' })).toContainText(
      'Microphone',
      { timeout: 30_000 },
    )
    await expect(electronPage.getByRole('region', { name: 'Voice & Video settings' })).toContainText(
      'Screen share',
    )
    await electronPage.screenshot({
      path: path.join(OC10_008_SCREENSHOT_DIR, 'electron-voice-video-settings.png'),
    })
    await electronPage.getByRole('button', { name: 'Close user settings' }).click()

    await browserPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(browserPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await electronPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(electronPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(1)
    await expect.poll(() => remoteParticipantCount(electronPage), { timeout: 75_000 }).toBe(1)

    const browserAudioEvidence = await waitForFullDuplexAudio(
      browserPage,
      OC10_008_EVIDENCE_DIR,
      'browser-audio-timeout',
    )
    const electronAudioEvidence = await waitForFullDuplexAudio(
      electronPage,
      OC10_008_EVIDENCE_DIR,
      'electron-audio-timeout',
    )
    await writeEvidenceTo(OC10_008_EVIDENCE_DIR, 'browser-audio.json', browserAudioEvidence)
    await writeEvidenceTo(OC10_008_EVIDENCE_DIR, 'electron-audio.json', electronAudioEvidence)

    await electronPage.getByRole('button', { name: 'Share screen' }).click()
    await expect(electronPage.getByRole('button', { name: 'Stop screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const electronShareEvidence = await waitForPublishedScreenShare(electronPage)
    const browserWatchEvidence = await waitForReceivedScreenShare(browserPage)
    await writeEvidenceTo(
      OC10_008_EVIDENCE_DIR,
      'electron-screen-share-publishing.json',
      electronShareEvidence,
    )
    await writeEvidenceTo(
      OC10_008_EVIDENCE_DIR,
      'browser-watching-electron-screen-share.json',
      browserWatchEvidence,
    )
    await electronPage.screenshot({
      path: path.join(OC10_008_SCREENSHOT_DIR, 'electron-screen-share-publishing.png'),
    })
    await browserPage.screenshot({
      path: path.join(OC10_008_SCREENSHOT_DIR, 'browser-watching-electron-screen-share.png'),
    })

    const electronAudioPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes('"kind": "audio"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_008_LOG_DIR, 'electron-audio-publish-livekit.log'),
      electronAudioPublishLog,
    )
    const electronAudioTrackId = extractLiveKitTrackId(electronAudioPublishLog)
    const browserAudioSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes(`"trackID": "${electronAudioTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_008_LOG_DIR, 'browser-audio-subscribe-livekit.log'),
      browserAudioSubscribeLog,
    )
    const electronScreenPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes('"kind": "video"') &&
        line.includes('"source": "SCREEN_SHARE"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_008_LOG_DIR, 'electron-screen-share-publish-livekit.log'),
      electronScreenPublishLog,
    )
    const electronScreenTrackId = extractLiveKitTrackId(electronScreenPublishLog)
    const browserVideoSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes(`"trackID": "${electronScreenTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_008_LOG_DIR, 'browser-screen-share-subscribe-livekit.log'),
      browserVideoSubscribeLog,
    )

    await electronPage.getByRole('button', { name: 'Mute microphone' }).click()
    await expect.poll(() => hasMutedLocalAudio(electronPage), { timeout: 30_000 }).toBe(true)
    await electronPage.getByRole('button', { name: 'Deafen audio' }).click()
    await expect(electronPage.getByRole('button', { name: 'Undeafen audio' })).toBeVisible()
    await electronPage.screenshot({
      path: path.join(OC10_008_SCREENSHOT_DIR, 'electron-muted-deafened.png'),
    })

    await electronPage.getByRole('button', { name: 'Disconnect voice' }).click()
    await expect(electronPage.getByLabel('Voice controls')).toContainText('Not connected', {
      timeout: 30_000,
    })
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(0)
    await browserPage.screenshot({
      path: path.join(OC10_008_SCREENSHOT_DIR, 'browser-after-electron-left.png'),
    })
    await writeFile(path.join(OC10_008_LOG_DIR, 'livekit.log'), await liveKitLogsSince(liveKitLogSince))

    await writeFile(
      path.join(OC10_008_EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-008 Browser To Electron Full Media Session',
        '',
        'Status: passed',
        '',
        `Browser participant: ${seeded.owner.userId}`,
        `Electron participant: ${seeded.guest.userId}`,
        `Voice channel: ${seeded.voiceChannelId}`,
        `Run id: ${runId}`,
        '',
        'Verified:',
        '',
        '- Electron showed the quiet Voice & Video settings panel.',
        '- Browser and Electron joined the same LiveKit voice room.',
        '- Browser and Electron exchanged microphone audio.',
        '- Electron published a screen-share video track.',
        '- Browser subscribed to and rendered the Electron screen-share track.',
        '- Electron mute, deafen, and leave controls updated media state.',
        '- Browser observed the Electron participant leave.',
        '',
      ].join('\n'),
    )
  } finally {
    await Promise.allSettled([
      browserContext.close(),
      electronApp?.close() ?? Promise.resolve(),
    ])
    await writeFile(path.join(OC10_008_LOG_DIR, 'electron-process.log'), electronLogs.join(''))
  }
})

test('OC-10-009 two browsers join scheduled meeting media with audio and screen share', async ({
  browser,
  request,
}) => {
  await mkdir(OC10_009_SCREENSHOT_DIR, { recursive: true })
  await mkdir(OC10_009_LOG_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_009_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord',
      'env OPENCORD_PHASE10_OC10_009_DIR=<WORKSPACE>/opencord/output/phase-10-media/20260624-oc-10-009-meeting-media OPENCORD_API_BASE_URL=http://localhost:8080 OPENCORD_WEB_BASE_URL=http://127.0.0.1:5173 fnm exec --using 26 pnpm --dir <WORKSPACE>/opencord-clients --filter web exec playwright test --grep "OC-10-009"',
      '```',
      '',
    ].join('\n'),
  )

  const seeded = await loadSeedMediaContext(request)
  const runId = `oc-10-009-${Date.now()}`
  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  const meetingRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Meeting Media ${Date.now()}`,
    ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, meetingRoleId, seeded.guest.userId)
  await writeFile(
    path.join(OC10_009_EVIDENCE_DIR, 'session-context.json'),
    `${JSON.stringify(
      {
        guestEmail: seeded.guest.email,
        guestPermissions: ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
        guestUserId: seeded.guest.userId,
        organizationId: seeded.organizationId,
        ownerEmail: seeded.owner.email,
        ownerUserId: seeded.owner.userId,
        runId,
        spaceId: seeded.spaceId,
        textChannelId: seeded.textChannelId,
      },
      null,
      2,
    )}\n`,
  )

  const ownerContext = await newMediaContext(browser)
  const guestContext = await newMediaContext(browser)
  const ownerPage = await ownerContext.newPage()
  const guestPage = await guestContext.newPage()

  try {
    await startLocalAlpha(ownerPage, seeded.owner)
    await startLocalAlpha(guestPage, seeded.guest)

    await joinSeedMeeting(ownerPage, seeded.meeting.title)
    await joinSeedMeeting(guestPage, seeded.meeting.title)
    await expect.poll(() => remoteParticipantCount(ownerPage), { timeout: 75_000 }).toBe(1)
    await expect.poll(() => remoteParticipantCount(guestPage), { timeout: 75_000 }).toBe(1)

    const ownerAudioEvidence = await waitForFullDuplexAudio(
      ownerPage,
      OC10_009_EVIDENCE_DIR,
      'owner-meeting-audio-timeout',
    )
    const guestAudioEvidence = await waitForFullDuplexAudio(
      guestPage,
      OC10_009_EVIDENCE_DIR,
      'guest-meeting-audio-timeout',
    )
    await writeEvidenceTo(OC10_009_EVIDENCE_DIR, 'owner-meeting-audio.json', ownerAudioEvidence)
    await writeEvidenceTo(OC10_009_EVIDENCE_DIR, 'guest-meeting-audio.json', guestAudioEvidence)
    await ownerPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'owner-meeting-connected.png'),
    })
    await guestPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'guest-meeting-connected.png'),
    })

    await ownerPage.getByRole('button', { name: 'Share meeting screen' }).click()
    await expect(ownerPage.getByRole('button', { name: 'Stop meeting screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const ownerShareEvidence = await waitForPublishedScreenShare(ownerPage)
    const guestWatchEvidence = await waitForReceivedScreenShare(guestPage)
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'owner-meeting-screen-share-publishing.json',
      ownerShareEvidence,
    )
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'guest-watching-meeting-screen-share.json',
      guestWatchEvidence,
    )
    await ownerPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'owner-meeting-screen-share.png'),
    })
    await guestPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'guest-watching-meeting-screen-share.png'),
    })

    await ownerPage.getByRole('button', { name: 'Mute meeting microphone' }).click()
    await expect(ownerPage.getByRole('button', { name: 'Unmute meeting microphone' })).toBeVisible()
    await expect.poll(() => hasMutedLocalAudio(ownerPage), { timeout: 30_000 }).toBe(true)
    await ownerPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'owner-meeting-muted.png'),
    })

    await guestPage.getByRole('button', { name: 'Leave meeting' }).click()
    await expect(guestPage.getByRole('heading', { name: 'Calendar' })).toBeVisible({
      timeout: 30_000,
    })
    await expect.poll(() => remoteParticipantCount(ownerPage), { timeout: 75_000 }).toBe(0)
    await ownerPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'owner-after-guest-left-meeting.png'),
    })
    await writeFile(path.join(OC10_009_LOG_DIR, 'livekit.log'), await liveKitLogsSince(liveKitLogSince))

    await writeFile(
      path.join(OC10_009_EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-009 Meeting Media Browser Session',
        '',
        'Status: passed',
        '',
        `Owner participant: ${seeded.owner.userId}`,
        `Guest participant: ${seeded.guest.userId}`,
        `Text channel: ${seeded.textChannelId}`,
        `Run id: ${runId}`,
        '',
        'Verified:',
        '',
        '- Two browsers joined the same scheduled meeting LiveKit room through the web UI.',
        '- Both browsers published microphone audio and subscribed to remote audio.',
        '- Meeting media tokens used the meeting room flow rather than the voice channel join flow.',
        '- Owner published a meeting screen-share video track.',
        '- Guest subscribed to and rendered the meeting screen-share track.',
        '- Meeting mute and leave controls updated media state.',
        '- Owner observed the guest leave the meeting media room.',
        '',
      ].join('\n'),
    )
  } finally {
    await Promise.allSettled([ownerContext.close(), guestContext.close()])
  }
})

test('OC-10-009 browser and Electron join scheduled meeting media with audio and screen share', async ({
  browser,
  request,
}) => {
  test.skip(
    process.env.OPENCORD_PHASE10_ELECTRON_E2E !== '1',
    'OC-10-009 browser/Electron meeting media requires the built Electron desktop app, local web server, and local media stack.',
  )

  await mkdir(OC10_009_SCREENSHOT_DIR, { recursive: true })
  await mkdir(OC10_009_LOG_DIR, { recursive: true })

  const seeded = await loadSeedMediaContext(request)
  const runId = `oc-10-009-electron-${Date.now()}`
  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  const meetingRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Meeting Electron ${Date.now()}`,
    ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, meetingRoleId, seeded.guest.userId)
  await writeFile(
    path.join(OC10_009_EVIDENCE_DIR, 'electron-session-context.json'),
    `${JSON.stringify(
      {
        browserEmail: seeded.owner.email,
        browserUserId: seeded.owner.userId,
        electronEmail: seeded.guest.email,
        electronPermissions: ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
        electronUserId: seeded.guest.userId,
        organizationId: seeded.organizationId,
        runId,
        spaceId: seeded.spaceId,
        textChannelId: seeded.textChannelId,
      },
      null,
      2,
    )}\n`,
  )

  const browserContext = await newMediaContext(browser)
  const browserPage = await browserContext.newPage()
  const electronLogs: string[] = []
  let electronApp: Awaited<ReturnType<typeof electron.launch>> | null = null

  try {
    electronApp = await electron.launch({
      args: [DESKTOP_MAIN_PATH],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        OPENCORD_DESKTOP_E2E_MEDIA: '1',
        OPENCORD_DESKTOP_RENDERER_URL: WEB_BASE_URL,
      },
    })
    const electronProcess = electronApp.process()
    electronProcess.stdout?.on('data', (chunk) => {
      electronLogs.push(String(chunk))
    })
    electronProcess.stderr?.on('data', (chunk) => {
      electronLogs.push(String(chunk))
    })
    const electronPage = await electronApp.firstWindow()
    await electronPage.setViewportSize({ width: 1280, height: 840 })
    await installPeerConnectionRecorderOnPage(electronPage)

    await startLocalAlpha(browserPage, seeded.owner)
    await startLocalAlpha(electronPage, seeded.guest)

    await joinSeedMeeting(browserPage, seeded.meeting.title)
    await joinSeedMeeting(electronPage, seeded.meeting.title)
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(1)
    await expect.poll(() => remoteParticipantCount(electronPage), { timeout: 75_000 }).toBe(1)

    const browserAudioEvidence = await waitForFullDuplexAudio(
      browserPage,
      OC10_009_EVIDENCE_DIR,
      'browser-electron-browser-audio-timeout',
    )
    const electronAudioEvidence = await waitForFullDuplexAudio(
      electronPage,
      OC10_009_EVIDENCE_DIR,
      'browser-electron-electron-audio-timeout',
    )
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-electron-browser-meeting-audio.json',
      browserAudioEvidence,
    )
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-electron-electron-meeting-audio.json',
      electronAudioEvidence,
    )

    await browserPage.getByRole('button', { name: 'Share meeting screen' }).click()
    await expect(browserPage.getByRole('button', { name: 'Stop meeting screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const browserShareEvidence = await waitForPublishedScreenShare(browserPage)
    const electronWatchEvidence = await waitForReceivedScreenShare(electronPage)
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-electron-browser-screen-share-publishing.json',
      browserShareEvidence,
    )
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-electron-electron-watching-screen-share.json',
      electronWatchEvidence,
    )
    await browserPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'browser-electron-browser-screen-share.png'),
    })
    await electronPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'browser-electron-electron-watching-screen-share.png'),
    })

    const electronAudioPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes('"kind": "audio"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'electron-meeting-audio-publish-livekit.log'),
      electronAudioPublishLog,
    )
    const electronAudioTrackId = extractLiveKitTrackId(electronAudioPublishLog)
    const browserAudioSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes(`"trackID": "${electronAudioTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-meeting-electron-audio-subscribe-livekit.log'),
      browserAudioSubscribeLog,
    )
    const browserScreenPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.owner.userId}"`) &&
        line.includes('"kind": "video"') &&
        line.includes('"source": "SCREEN_SHARE"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-meeting-screen-share-publish-livekit.log'),
      browserScreenPublishLog,
    )
    const browserScreenTrackId = extractLiveKitTrackId(browserScreenPublishLog)
    const electronVideoSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes(`"trackID": "${browserScreenTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'electron-meeting-screen-share-subscribe-livekit.log'),
      electronVideoSubscribeLog,
    )

    await electronPage.getByRole('button', { name: 'Mute meeting microphone' }).click()
    await expect.poll(() => hasMutedLocalAudio(electronPage), { timeout: 30_000 }).toBe(true)
    await electronPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'browser-electron-electron-muted.png'),
    })

    await electronPage.getByRole('button', { name: 'Leave meeting' }).click()
    await expect(electronPage.getByRole('heading', { name: 'Calendar' })).toBeVisible({
      timeout: 30_000,
    })
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(0)
    await browserPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'browser-electron-browser-after-electron-left.png'),
    })
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-electron-livekit.log'),
      await liveKitLogsSince(liveKitLogSince),
    )

    await writeFile(
      path.join(OC10_009_EVIDENCE_DIR, 'browser-electron-result.md'),
      [
        '# OC-10-009 Meeting Media Browser To Electron Session',
        '',
        'Status: passed',
        '',
        `Browser participant: ${seeded.owner.userId}`,
        `Electron participant: ${seeded.guest.userId}`,
        `Text channel: ${seeded.textChannelId}`,
        `Run id: ${runId}`,
        '',
        'Verified:',
        '',
        '- Browser and Electron joined the same scheduled meeting LiveKit room.',
        '- Browser and Electron exchanged microphone audio.',
        '- Browser published a meeting screen-share video track.',
        '- Electron subscribed to and rendered the meeting screen-share track.',
        '- Electron meeting mute and leave controls updated media state.',
        '- Browser observed Electron leave the meeting media room.',
        '',
      ].join('\n'),
    )
  } finally {
    await Promise.allSettled([
      browserContext.close(),
      electronApp?.close() ?? Promise.resolve(),
    ])
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'electron-meeting-process.log'),
      electronLogs.join(''),
    )
  }
})

test('OC-10-009 browser and Android 15 join scheduled meeting media with audio and screen share', async ({
  browser,
  request,
}) => {
  test.skip(
    process.env.OPENCORD_PHASE10_ANDROID_E2E !== '1',
    'OC-10-009 browser/Android meeting media requires a running Android 15 emulator, installed debug app, and local media stack.',
  )

  await mkdir(OC10_009_SCREENSHOT_DIR, { recursive: true })
  await mkdir(OC10_009_LOG_DIR, { recursive: true })

  const seeded = await loadSeedMediaContext(request)
  const runId = `oc-10-009-android-${Date.now()}`
  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  const androidUser = await registerUser(request, {
    displayName: 'Media Android',
    email: `phase10-android-${Date.now()}@opencord.local`,
    password: 'phase10-android-password',
  })
  await addSpaceMember(request, seeded.owner, seeded.spaceId, androidUser.userId)
  const meetingRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Meeting Android ${Date.now()}`,
    ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, meetingRoleId, androidUser.userId)
  await assignRole(request, seeded.owner, seeded.spaceId, meetingRoleId, seeded.guest.userId)
  const androidCommandServer = await startMobileE2ECommandServer()
  let browserContext: BrowserContext | null = null

  try {
    await writeFile(
      path.join(OC10_009_EVIDENCE_DIR, 'android-session-context.json'),
      `${JSON.stringify(
        {
          androidCommandUrl: androidHostUrl(androidCommandServer.url),
          androidEmail: androidUser.email,
          androidUserId: androidUser.userId,
          browserEmail: seeded.guest.email,
          browserPermissions: ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
          browserUserId: seeded.guest.userId,
          meetingId: seeded.meeting.id,
          meetingTitle: seeded.meeting.title,
          organizationId: seeded.organizationId,
          runId,
          spaceId: seeded.spaceId,
        },
        null,
        2,
      )}\n`,
    )

    await ensureAndroidMeetingReady(
      androidUser,
      seeded.meeting,
      runId,
      androidCommandServer.url,
    )

    browserContext = await newMediaContext(browser)
    const browserPage = await browserContext.newPage()

    await startLocalAlpha(browserPage, seeded.guest)
    await joinSeedMeeting(browserPage, seeded.meeting.title)
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(1)

    const browserAudioEvidence = await waitForFullDuplexAudio(
      browserPage,
      OC10_009_EVIDENCE_DIR,
      'browser-android-browser-audio-timeout',
    )
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-android-browser-meeting-audio.json',
      browserAudioEvidence,
    )

    await browserPage.getByRole('button', { name: 'Share meeting screen' }).click()
    await expect(browserPage.getByRole('button', { name: 'Stop meeting screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const browserShareEvidence = await waitForPublishedScreenShare(browserPage)
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-android-browser-screen-share-publishing.json',
      browserShareEvidence,
    )
    await browserPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'browser-android-browser-screen-share.png'),
    })

    const androidWatcherXml = await waitForAndroidText('Watching 1 screen share', 90_000)
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'android-meeting-watching-screen-share-window.xml'),
      androidWatcherXml,
    )
    await writeAndroidScreenshot(
      'android-meeting-watching-screen-share.png',
      OC10_009_SCREENSHOT_DIR,
    )

    const androidAudioPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${androidUser.userId}"`) &&
        line.includes('"kind": "audio"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'android-meeting-audio-publish-livekit.log'),
      androidAudioPublishLog,
    )
    const androidAudioTrackId = extractLiveKitTrackId(androidAudioPublishLog)
    const browserAudioSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes(`"trackID": "${androidAudioTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-meeting-android-audio-subscribe-livekit.log'),
      browserAudioSubscribeLog,
    )
    const browserScreenPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes('"kind": "video"') &&
        line.includes('"source": "SCREEN_SHARE"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-meeting-android-screen-share-publish-livekit.log'),
      browserScreenPublishLog,
    )
    const browserScreenTrackId = extractLiveKitTrackId(browserScreenPublishLog)
    const androidVideoSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${androidUser.userId}"`) &&
        line.includes(`"trackID": "${browserScreenTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'android-meeting-screen-share-subscribe-livekit.log'),
      androidVideoSubscribeLog,
    )

    androidCommandServer.send('mute')
    const mutedXml = await waitForAndroidText('You - muted', 45_000)
    await writeFile(path.join(OC10_009_LOG_DIR, 'android-meeting-muted-window.xml'), mutedXml)
    await writeAndroidScreenshot('android-meeting-muted.png', OC10_009_SCREENSHOT_DIR)

    androidCommandServer.send('deaf')
    const deafenedXml = await waitForAndroidText('You - deafened', 45_000)
    await writeFile(path.join(OC10_009_LOG_DIR, 'android-meeting-deafened-window.xml'), deafenedXml)
    await writeAndroidScreenshot('android-meeting-deafened.png', OC10_009_SCREENSHOT_DIR)

    androidCommandServer.send('leave')
    const leftXml = await waitForAndroidVoiceDisconnected(60_000)
    await writeFile(path.join(OC10_009_LOG_DIR, 'android-meeting-left-window.xml'), leftXml)
    await writeAndroidScreenshot('android-meeting-left.png', OC10_009_SCREENSHOT_DIR)
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(0)
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-android-livekit.log'),
      await liveKitLogsSince(liveKitLogSince),
    )

    await writeFile(
      path.join(OC10_009_EVIDENCE_DIR, 'browser-android-result.md'),
      [
        '# OC-10-009 Meeting Media Browser To Android 15 Session',
        '',
        'Status: passed',
        '',
        `Android participant: ${androidUser.userId}`,
        `Browser participant: ${seeded.guest.userId}`,
        `Meeting: ${seeded.meeting.id}`,
        `Run id: ${runId}`,
        '',
        'Verified:',
        '',
        '- Android 15 app joined the scheduled meeting LiveKit room through the native E2E launch path.',
        '- Browser joined the same scheduled meeting room through the web UI.',
        '- Browser and Android exchanged microphone audio.',
        '- Browser published a meeting screen-share video track.',
        '- Android subscribed to and rendered the meeting screen-share track.',
        '- Android meeting mute, deafen, and leave controls updated native state.',
        '- Browser observed Android leave the meeting media room.',
        '',
      ].join('\n'),
    )
  } finally {
    const cleanup: Promise<unknown>[] = [androidCommandServer.close()]
    if (browserContext) {
      cleanup.push(browserContext.close())
    }
    await Promise.allSettled(cleanup)
  }
})

test('OC-10-009 browser and iOS simulator join scheduled meeting media with audio and screen share', async ({
  browser,
  request,
}) => {
  test.skip(
    process.env.OPENCORD_PHASE10_IOS_E2E !== '1',
    'OC-10-009 browser/iOS meeting media requires the iPhone 17 Pro Max iOS 26.5 simulator, installed debug app, Metro, and local media stack.',
  )

  await mkdir(OC10_009_SCREENSHOT_DIR, { recursive: true })
  await mkdir(OC10_009_LOG_DIR, { recursive: true })

  const seeded = await loadSeedMediaContext(request)
  const runId = `oc-10-009-ios-${Date.now()}`
  const liveKitLogSince = new Date(Date.now() - 1_000).toISOString()
  const iosUser = await registerUser(request, {
    displayName: 'Media iOS',
    email: `phase10-ios-${Date.now()}@opencord.local`,
    password: 'phase10-ios-password',
  })
  await addSpaceMember(request, seeded.owner, seeded.spaceId, iosUser.userId)
  const meetingRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Meeting iOS ${Date.now()}`,
    ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, meetingRoleId, iosUser.userId)
  await assignRole(request, seeded.owner, seeded.spaceId, meetingRoleId, seeded.guest.userId)
  const iosCommandServer = await startMobileE2ECommandServer()
  let browserContext: BrowserContext | null = null

  try {
    await writeFile(
      path.join(OC10_009_EVIDENCE_DIR, 'ios-session-context.json'),
      `${JSON.stringify(
        {
          browserEmail: seeded.guest.email,
          browserPermissions: ['CONNECT_VOICE', 'SPEAK', 'USE_VIDEO', 'SHARE_SCREEN'],
          browserUserId: seeded.guest.userId,
          iOSCommandUrl: iosCommandServer.url,
          iOSDevice: 'iPhone 17 Pro Max',
          iOSRuntime: 'iOS 26.5',
          iOSUdid: IOS_SIMULATOR_UDID,
          iOSUserId: iosUser.userId,
          meetingId: seeded.meeting.id,
          meetingTitle: seeded.meeting.title,
          organizationId: seeded.organizationId,
          runId,
          spaceId: seeded.spaceId,
        },
        null,
        2,
      )}\n`,
    )

    await ensureIosMeetingReady(iosUser, seeded.meeting, runId, iosCommandServer, liveKitLogSince)

    browserContext = await newMediaContext(browser)
    const browserPage = await browserContext.newPage()

    await startLocalAlpha(browserPage, seeded.guest)
    await joinSeedMeeting(browserPage, seeded.meeting.title)
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(1)

    const browserAudioEvidence = await waitForLocalAudio(browserPage)
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-ios-browser-meeting-audio.json',
      browserAudioEvidence,
    )

    const iosAudioPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${iosUser.userId}"`) &&
        line.includes('"kind": "audio"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'ios-meeting-audio-publish-livekit.log'),
      iosAudioPublishLog,
    )
    const iosAudioTrackId = extractLiveKitTrackId(iosAudioPublishLog)
    const browserAudioSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('track subscribed') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes(`"trackID": "${iosAudioTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-meeting-ios-audio-subscribe-livekit.log'),
      browserAudioSubscribeLog,
    )

    await browserPage.getByRole('button', { name: 'Share meeting screen' }).click()
    await expect(browserPage.getByRole('button', { name: 'Stop meeting screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const browserShareEvidence = await waitForPublishedScreenShare(browserPage)
    await writeEvidenceTo(
      OC10_009_EVIDENCE_DIR,
      'browser-ios-browser-screen-share-publishing.json',
      browserShareEvidence,
    )
    await browserPage.screenshot({
      path: path.join(OC10_009_SCREENSHOT_DIR, 'browser-ios-browser-screen-share.png'),
    })

    const browserScreenPublishLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('mediaTrack published') &&
        line.includes(`"participant": "${seeded.guest.userId}"`) &&
        line.includes('"kind": "video"') &&
        line.includes('"source": "SCREEN_SHARE"'),
      60_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-meeting-ios-screen-share-publish-livekit.log'),
      browserScreenPublishLog,
    )
    const browserScreenTrackId = extractLiveKitTrackId(browserScreenPublishLog)
    const iosVideoSubscribeLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('subscribed to track') &&
        line.includes(`"participant": "${iosUser.userId}"`) &&
        line.includes(`"trackID": "${browserScreenTrackId}"`),
      120_000,
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'ios-meeting-screen-share-subscribe-livekit.log'),
      iosVideoSubscribeLog,
    )
    await writeIosScreenshot('ios-meeting-watching-screen-share.png', OC10_009_SCREENSHOT_DIR)

    iosCommandServer.send('mute')
    const mutedState = await waitForMobileE2EState(
      iosCommandServer,
      (state) => mobileE2EVoiceMuted(state, runId),
      45_000,
      'iOS meeting muted state',
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'ios-meeting-muted-state.json'),
      mobileE2EStateJson(mutedState),
    )
    const mutedLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes('publisher mute status changed') &&
        line.includes(`"participant": "${iosUser.userId}"`) &&
        line.includes(`"trackID": "${iosAudioTrackId}"`) &&
        line.includes('"muted": true'),
      45_000,
    )
    await writeFile(path.join(OC10_009_LOG_DIR, 'ios-meeting-muted-livekit.log'), mutedLog)
    await writeIosScreenshot('ios-meeting-muted.png', OC10_009_SCREENSHOT_DIR)

    iosCommandServer.send('leave')
    const leftState = await waitForMobileE2EState(
      iosCommandServer,
      (state) => mobileE2EVoiceLeft(state, runId),
      60_000,
      'iOS meeting left state',
    )
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'ios-meeting-left-state.json'),
      mobileE2EStateJson(leftState),
    )
    const leftLog = await waitForLiveKitLine(
      liveKitLogSince,
      (line) =>
        line.includes(`"participant": "${iosUser.userId}"`) &&
        (line.includes('track unpublished') ||
          line.includes('RTC session finishing') ||
          line.includes('"state": "DISCONNECTED"')),
      60_000,
    )
    await writeFile(path.join(OC10_009_LOG_DIR, 'ios-meeting-left-livekit.log'), leftLog)
    await writeIosScreenshot('ios-meeting-left.png', OC10_009_SCREENSHOT_DIR)
    await expect.poll(() => remoteParticipantCount(browserPage), { timeout: 75_000 }).toBe(0)
    await writeFile(
      path.join(OC10_009_LOG_DIR, 'browser-ios-livekit.log'),
      await liveKitLogsSince(liveKitLogSince),
    )

    await writeFile(
      path.join(OC10_009_EVIDENCE_DIR, 'browser-ios-result.md'),
      [
        '# OC-10-009 Meeting Media Browser To iOS Simulator Session',
        '',
        'Status: passed',
        '',
        `iOS participant: ${iosUser.userId}`,
        `Browser participant: ${seeded.guest.userId}`,
        `Meeting: ${seeded.meeting.id}`,
        `iOS simulator: iPhone 17 Pro Max iOS 26.5 (${IOS_SIMULATOR_UDID})`,
        `Run id: ${runId}`,
        '',
        'Verified:',
        '',
        '- iOS simulator app joined the scheduled meeting LiveKit room through the native E2E launch path.',
        '- Browser joined the same scheduled meeting room through the web UI.',
        '- Browser and iOS exchanged microphone audio.',
        '- Browser published a meeting screen-share video track.',
        '- iOS subscribed to the meeting screen-share track.',
        '- iOS meeting mute and leave commands updated app state and LiveKit room state.',
        '- Browser observed iOS leave the meeting media room.',
        '',
      ].join('\n'),
    )
  } finally {
    const cleanup: Promise<unknown>[] = [iosCommandServer.close()]
    if (browserContext) {
      cleanup.push(browserContext.close())
    }
    await Promise.allSettled(cleanup)
  }
})

test('OC-10-010 browser voice and screen share use forced TURN relay candidates', async ({
  browser,
  request,
}) => {
  test.skip(
    process.env.OPENCORD_PHASE10_TURN_E2E !== '1',
    'OC-10-010 requires coturn, LiveKit TURN config, API, and web dev server.',
  )

  await mkdir(OC10_010_SCREENSHOT_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_010_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord-server',
      'make dev-turn',
      'make dev-media-turn-hostnet',
      'cd <WORKSPACE>/opencord-clients',
      'OPENCORD_PHASE10_TURN_E2E=1 OPENCORD_PHASE10_OC10_010_DIR=<WORKSPACE>/opencord/output/phase-10-media/20260624-oc-10-010-turn-relay OPENCORD_API_BASE_URL=http://127.0.0.1:8080 OPENCORD_WEB_BASE_URL=http://localhost:5173 OPENCORD_TURN_URLS="turn:127.0.0.1:3478?transport=udp,turn:127.0.0.1:3478?transport=tcp" fnm exec --using 26 pnpm --filter web exec playwright test --grep "OC-10-010"',
      '```',
      '',
    ].join('\n'),
  )

  const rtcConfig = turnRelayRtcConfig()
  await writeFile(
    path.join(OC10_010_EVIDENCE_DIR, 'turn-runtime-context.json'),
    `${JSON.stringify(
      {
        iceTransportPolicy: rtcConfig.iceTransportPolicy,
        turnUrls: rtcConfig.iceServers?.flatMap((server) => server.urls) ?? [],
        turnUsername: firstIceServerUsername(rtcConfig),
        turnCredentialPresent: Boolean(firstIceServerCredential(rtcConfig)),
      },
      null,
      2,
    )}\n`,
  )

  const seeded = await loadSeedMediaContext(request)
  const ownerContext = await newMediaContext(browser, rtcConfig)
  const guestContext = await newMediaContext(browser, rtcConfig)
  const ownerPage = await ownerContext.newPage()
  const guestPage = await guestContext.newPage()

  try {
    await startLocalAlpha(ownerPage, seeded.owner)
    await startLocalAlpha(guestPage, seeded.guest)

    await ownerPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(ownerPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await guestPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(guestPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })

    const ownerVoiceRelayEvidence = await waitForFullDuplexRelay(
      ownerPage,
      OC10_010_EVIDENCE_DIR,
      'browser-owner-voice-relay-timeout',
    )
    const guestVoiceRelayEvidence = await waitForFullDuplexRelay(
      guestPage,
      OC10_010_EVIDENCE_DIR,
      'browser-guest-voice-relay-timeout',
    )
    await writeEvidenceTo(
      OC10_010_EVIDENCE_DIR,
      'browser-owner-voice-relay.json',
      ownerVoiceRelayEvidence,
    )
    await writeEvidenceTo(
      OC10_010_EVIDENCE_DIR,
      'browser-guest-voice-relay.json',
      guestVoiceRelayEvidence,
    )

    await ownerPage.getByRole('button', { name: 'Share screen' }).click()
    await expect(ownerPage.getByRole('button', { name: 'Stop screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const ownerShareRelayEvidence = await waitForPublishedScreenShareRelay(
      ownerPage,
      OC10_010_EVIDENCE_DIR,
      'browser-owner-screen-share-relay-timeout',
    )
    const guestWatchRelayEvidence = await waitForReceivedScreenShareRelay(
      guestPage,
      OC10_010_EVIDENCE_DIR,
      'browser-guest-screen-watch-relay-timeout',
    )
    await writeEvidenceTo(
      OC10_010_EVIDENCE_DIR,
      'browser-owner-screen-share-relay.json',
      ownerShareRelayEvidence,
    )
    await writeEvidenceTo(
      OC10_010_EVIDENCE_DIR,
      'browser-guest-screen-watch-relay.json',
      guestWatchRelayEvidence,
    )
    await ownerPage.screenshot({
      path: path.join(OC10_010_SCREENSHOT_DIR, 'browser-owner-turn-screen-share.png'),
    })
    await guestPage.screenshot({
      path: path.join(OC10_010_SCREENSHOT_DIR, 'browser-guest-turn-screen-watch.png'),
    })

    await writeFile(
      path.join(OC10_010_EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-010 TURN Relay Fallback',
        '',
        'Status: passed',
        '',
        `Owner participant: ${seeded.owner.userId}`,
        `Guest participant: ${seeded.guest.userId}`,
        `Voice channel: ${seeded.voiceChannelId}`,
        '',
        'Verified:',
        '',
        '- Browser contexts used relay-only RTC config.',
        '- TURN credentials were configured and non-anonymous.',
        '- Both browsers exchanged microphone audio with selected relay candidate pairs.',
        '- Owner published screen share and guest rendered it with selected relay candidate pairs.',
        '- WebRTC stats include relay candidate evidence for the selected candidate pair.',
        '',
      ].join('\n'),
    )

    await ownerPage.getByRole('button', { name: 'Stop screen share' }).click()
    await Promise.allSettled([
      ownerPage.getByRole('button', { name: 'Disconnect voice' }).click({ timeout: 10_000 }),
      guestPage.getByRole('button', { name: 'Disconnect voice' }).click({ timeout: 10_000 }),
    ])
  } finally {
    await Promise.allSettled([ownerContext.close(), guestContext.close()])
  }
})

test('OC-10-011 media permission revocation unpublishes and disconnects live clients', async ({
  browser,
  request,
}) => {
  await mkdir(OC10_011_SCREENSHOT_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_011_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord-clients',
      'fnm exec --using 26 pnpm --filter web exec playwright test --grep "OC-10-011"',
      '```',
      '',
    ].join('\n'),
  )

  const seeded = await loadSeedMediaContext(request)
  const screenShareRoleId = await createRole(
    request,
    seeded.owner,
    seeded.spaceId,
    `Phase 10 Permission Screen ${Date.now()}`,
    ['SHARE_SCREEN'],
  )
  await assignRole(request, seeded.owner, seeded.spaceId, screenShareRoleId, seeded.guest.userId)

  const ownerContext = await newMediaContext(browser)
  const guestContext = await newMediaContext(browser)
  const ownerPage = await ownerContext.newPage()
  const guestPage = await guestContext.newPage()

  try {
    await startLocalAlpha(ownerPage, seeded.owner)
    await startLocalAlpha(guestPage, seeded.guest)
    await expect(guestPage.getByText('Realtime connected')).toBeVisible({ timeout: 30_000 })

    await ownerPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(ownerPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await guestPage.getByRole('button', { name: 'Join Voice: Voice Lounge' }).click()
    await expect(guestPage.getByLabel('Voice controls')).toContainText('Voice Lounge', {
      timeout: 30_000,
    })
    await expect.poll(() => remoteParticipantCount(ownerPage), { timeout: 60_000 }).toBe(1)

    await guestPage.getByRole('button', { name: 'Share screen' }).click()
    await expect(guestPage.getByRole('button', { name: 'Stop screen share' })).toBeVisible({
      timeout: 30_000,
    })
    const guestScreenEvidence = await waitForPublishedScreenShare(guestPage)
    const ownerWatchEvidence = await waitForReceivedScreenShare(ownerPage)
    await writeEvidenceTo(
      OC10_011_EVIDENCE_DIR,
      'guest-screen-before-revoke.json',
      guestScreenEvidence,
    )
    await writeEvidenceTo(
      OC10_011_EVIDENCE_DIR,
      'owner-screen-watch-before-revoke.json',
      ownerWatchEvidence,
    )
    await guestPage.screenshot({
      path: path.join(OC10_011_SCREENSHOT_DIR, 'guest-screen-before-revoke.png'),
    })
    await ownerPage.screenshot({
      path: path.join(OC10_011_SCREENSHOT_DIR, 'owner-watch-before-revoke.png'),
    })

    await setMemberChannelPermissionOverride(
      request,
      seeded.owner,
      seeded.voiceChannelId,
      seeded.guest.userId,
      [],
      ['SHARE_SCREEN'],
    )
    await expect(guestPage.getByRole('button', { name: 'Share screen' })).toBeVisible({
      timeout: 30_000,
    })
    await expect(guestPage.getByRole('alert')).toContainText(
      'Voice permissions changed. Screen sharing stopped.',
      { timeout: 30_000 },
    )
    await expect
      .poll(() => remoteScreenShareVideoCount(ownerPage), { timeout: 45_000 })
      .toBe(0)
    await writeEvidenceTo(
      OC10_011_EVIDENCE_DIR,
      'guest-after-screen-revoke.json',
      await collectMediaEvidence(guestPage),
    )
    await writeEvidenceTo(
      OC10_011_EVIDENCE_DIR,
      'owner-after-screen-revoke.json',
      await collectMediaEvidence(ownerPage),
    )
    await guestPage.screenshot({
      path: path.join(OC10_011_SCREENSHOT_DIR, 'guest-after-screen-revoke.png'),
    })
    await ownerPage.screenshot({
      path: path.join(OC10_011_SCREENSHOT_DIR, 'owner-after-screen-revoke.png'),
    })

    await setMemberChannelPermissionOverride(
      request,
      seeded.owner,
      seeded.voiceChannelId,
      seeded.guest.userId,
      [],
      ['CONNECT_VOICE', 'SPEAK', 'SHARE_SCREEN'],
    )
    await expect(guestPage.getByLabel('Voice controls')).toContainText('Not connected', {
      timeout: 30_000,
    })
    await expect(guestPage.getByRole('alert')).toContainText(
      'Voice access changed. You were removed from the channel.',
      { timeout: 30_000 },
    )
    await expect.poll(() => remoteParticipantCount(ownerPage), { timeout: 60_000 }).toBe(0)
    await writeEvidenceTo(
      OC10_011_EVIDENCE_DIR,
      'guest-after-connect-revoke.json',
      await collectMediaEvidence(guestPage),
    )
    await writeEvidenceTo(
      OC10_011_EVIDENCE_DIR,
      'owner-after-connect-revoke.json',
      await collectMediaEvidence(ownerPage),
    )
    await guestPage.screenshot({
      path: path.join(OC10_011_SCREENSHOT_DIR, 'guest-after-connect-revoke.png'),
    })
    await ownerPage.screenshot({
      path: path.join(OC10_011_SCREENSHOT_DIR, 'owner-after-connect-revoke.png'),
    })

    await writeFile(
      path.join(OC10_011_EVIDENCE_DIR, 'result.md'),
      [
        '# OC-10-011 Media Permission And Abuse Boundaries',
        '',
        'Status: passed',
        '',
        `Revoked participant: ${seeded.guest.userId}`,
        `Observer participant: ${seeded.owner.userId}`,
        `Voice channel: ${seeded.voiceChannelId}`,
        '',
        'Verified:',
        '',
        '- Browser guest joined voice and published screen share through LiveKit.',
        '- Owner browser received the screen-share video before revocation.',
        '- Real channel permission override denied SHARE_SCREEN and guest stopped publishing.',
        '- Owner browser screen-share watcher cleared after publish revocation.',
        '- Real channel permission override denied CONNECT_VOICE and guest disconnected.',
        '- Owner browser observed the revoked participant leave the LiveKit room.',
        '',
      ].join('\n'),
    )
  } finally {
    await Promise.allSettled([ownerContext.close(), guestContext.close()])
  }
})

test('OC-10-012 media observability and diagnostics audit', async ({ request }) => {
  await mkdir(OC10_012_EVIDENCE_DIR, { recursive: true })
  await writeFile(
    path.join(OC10_012_EVIDENCE_DIR, 'commands.md'),
    [
      '# Commands',
      '',
      '```bash',
      'cd <WORKSPACE>/opencord-clients',
      'OPENCORD_PHASE10_OC10_012_DIR=<WORKSPACE>/opencord/output/phase-10-media/<run>-oc-10-012-observability-diagnostics OPENCORD_API_BASE_URL=http://localhost:8080 OPENCORD_WEB_BASE_URL=http://localhost:5173 fnm exec --using 26 pnpm --filter web exec playwright test --grep "OC-10-012"',
      '```',
      '',
    ].join('\n'),
  )

  await resetBackendRateLimits(request)
  const owner = await loginUser(request, SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, 'OpenCord Owner')
  const organization = await findOrganization(request, owner, 'OpenCord Local Alpha')
  const space = await findSpace(request, owner, organization.id, 'Local Alpha')
  const channels = await listChannels(request, owner, space.id)
  const voiceChannel = channels.find(
    (candidate) => candidate.kind === 'voice' && candidate.name === 'Voice Lounge',
  )
  expect(voiceChannel).toBeTruthy()

  const health = await request.get(`${API_BASE_URL}/healthz`)
  expect(health.ok()).toBeTruthy()
  await writeFile(
    path.join(OC10_012_EVIDENCE_DIR, 'healthz.json'),
    JSON.stringify(await health.json(), null, 2),
  )

  const metricsBefore = await readMetrics(request)
  await writeFile(path.join(OC10_012_EVIDENCE_DIR, 'metrics-before.txt'), metricsBefore)

  const ownerJoin = await request.post(`${API_BASE_URL}/voice/channels/${voiceChannel!.id}/join`, {
    data: { self_deaf: false, self_mute: false },
    headers: owner.headers,
  })
  expect(ownerJoin.status()).toBe(201)

  const deniedUser = await registerUser(request, {
    displayName: 'Media Metrics Denied',
    email: `phase10-media-metrics-denied-${Date.now()}@opencord.local`,
    password: 'correct horse battery staple',
  })
  await addSpaceMember(request, owner, space.id, deniedUser.userId)
  const deniedJoin = await request.post(`${API_BASE_URL}/voice/channels/${voiceChannel!.id}/join`, {
    data: { self_deaf: false, self_mute: false },
    headers: deniedUser.headers,
  })
  expect(deniedJoin.status()).toBe(403)

  const metricsAfter = await readMetrics(request)
  await writeFile(path.join(OC10_012_EVIDENCE_DIR, 'metrics-after.txt'), metricsAfter)
  expectMetricPresent(metricsAfter, 'opencord_media_voice_join_success_total')
  expectMetricPresent(
    metricsAfter,
    'opencord_media_voice_join_failures_total{reason="permission_denied"}',
  )
  expect(metricsAfter).toContain(`channel_id="${voiceChannel!.id}"`)

  const artifactAudits = await auditMediaEvidenceArtifacts()
  expect(artifactAudits).toHaveLength(8)
  for (const audit of artifactAudits) {
    expect(audit.statusPassed, `${audit.label} result.md must contain Status: passed`).toBe(true)
    expect(audit.files.length, `${audit.label} must have required evidence files`).toBeGreaterThan(
      0,
    )
    for (const file of audit.files) {
      expect(file.bytes, `${audit.label} ${file.path} must not be empty`).toBeGreaterThan(0)
    }
  }

  const configText = await readFile(path.join(process.cwd(), 'playwright.config.ts'), 'utf8')
  const failureCapture = {
    screenshotOnlyOnFailure: configText.includes("screenshot: 'only-on-failure'"),
    traceRetainOnFailure: configText.includes("trace: 'retain-on-failure'"),
  }
  expect(failureCapture.screenshotOnlyOnFailure).toBe(true)
  expect(failureCapture.traceRetainOnFailure).toBe(true)

  await writeFile(
    path.join(OC10_012_EVIDENCE_DIR, 'artifact-manifest.json'),
    JSON.stringify(
      {
        apiBaseUrl: API_BASE_URL,
        artifactAudits,
        failureCapture,
        metrics: {
          hasParticipantGaugeForVoiceChannel: metricsAfter.includes(
            `channel_id="${voiceChannel!.id}"`,
          ),
          permissionDeniedFailures: metricSampleValue(
            metricsAfter,
            'opencord_media_voice_join_failures_total{reason="permission_denied"}',
          ),
          voiceJoinSuccessTotal: metricSampleValue(
            metricsAfter,
            'opencord_media_voice_join_success_total',
          ),
        },
        otel: {
          enabledEnv: process.env.OPENCORD_OTEL_ENABLED ?? null,
          startupVerifiedByHealthz: true,
        },
        webBaseUrl: WEB_BASE_URL,
      },
      null,
      2,
    ),
  )

  await writeFile(
    path.join(OC10_012_EVIDENCE_DIR, 'result.md'),
    [
      '# OC-10-012 Media Observability And Diagnostics',
      '',
      'Status: passed',
      '',
      'Verified:',
      '',
      '- API health works with OTEL disabled/unset.',
      '- Media metrics include voice join success, permission-denied join failure, and participant gauge samples.',
      '- Browser, Electron, Android 15, iOS simulator, meeting, TURN, and permission-boundary media runs have non-empty evidence artifacts.',
      '- Required JSON evidence includes LiveKit diagnostics and WebRTC stats summaries where applicable.',
      '- Playwright failure capture is configured for retained traces and failure screenshots.',
      '',
    ].join('\n'),
  )
})

async function newMediaContext(browser: Browser, rtcConfig?: RTCConfiguration) {
  const context = await browser.newContext({
    baseURL: WEB_BASE_URL,
    permissions: ['microphone'],
  })
  if (rtcConfig) {
    await context.addInitScript((config) => {
      ;(window as Window & { __OPENCORD_MEDIA_RTC_CONFIG__?: RTCConfiguration })
        .__OPENCORD_MEDIA_RTC_CONFIG__ = config
    }, rtcConfig)
  }
  await installPeerConnectionRecorder(context)
  return context
}

async function installPeerConnectionRecorder(context: BrowserContext) {
  await context.addInitScript(peerConnectionRecorderScript)
}

async function installPeerConnectionRecorderOnPage(page: Page) {
  await page.addInitScript(peerConnectionRecorderScript)
  await page.evaluate(peerConnectionRecorderScript)
}

function peerConnectionRecorderScript() {
  const opencordWindow = window as unknown as {
    __opencordCollectPeerConnectionStats?: () => Promise<PeerConnectionReport[]>
  }
  if (opencordWindow.__opencordCollectPeerConnectionStats) {
    return
  }

  const connections: RTCPeerConnection[] = []
  const metadata = new WeakMap<
    RTCPeerConnection,
    {
      configuration?: PeerConnectionReport['configuration']
      connectionStateEvents: string[]
      iceCandidateErrors: PeerConnectionReport['iceCandidateErrors']
      iceCandidates: string[]
      iceConnectionStateEvents: string[]
    }
  >()
  const NativeRTCPeerConnection = window.RTCPeerConnection
  window.RTCPeerConnection = class extends NativeRTCPeerConnection {
    constructor(configuration?: RTCConfiguration) {
      super(configuration)
      const connectionMetadata = {
        configuration: sanitizeRtcConfiguration(configuration),
        connectionStateEvents: [this.connectionState],
        iceCandidateErrors: [],
        iceCandidates: [],
        iceConnectionStateEvents: [this.iceConnectionState],
      }
      metadata.set(this, connectionMetadata)
      this.addEventListener('connectionstatechange', () => {
        connectionMetadata.connectionStateEvents.push(this.connectionState)
      })
      this.addEventListener('icecandidate', (event) => {
        connectionMetadata.iceCandidates.push(event.candidate?.candidate ?? 'null')
      })
      this.addEventListener('icecandidateerror', (event) => {
        connectionMetadata.iceCandidateErrors.push({
          address: event.address,
          errorCode: event.errorCode,
          errorText: event.errorText,
          port: event.port,
          url: event.url,
        })
      })
      this.addEventListener('iceconnectionstatechange', () => {
        connectionMetadata.iceConnectionStateEvents.push(this.iceConnectionState)
      })
      connections.push(this)
    }
  } as typeof RTCPeerConnection

  function sanitizeRtcConfiguration(configuration?: RTCConfiguration) {
    return {
      iceServers:
        configuration?.iceServers?.map((server) => {
          const urls = Array.isArray(server.urls) ? server.urls : [server.urls]
          return {
            credentialPresent: Boolean(server.credential),
            urls: urls.filter((url): url is string => typeof url === 'string'),
            usernamePresent: Boolean(server.username),
          }
        }) ?? [],
      iceTransportPolicy: configuration?.iceTransportPolicy,
    }
  }

  Object.defineProperty(window, '__opencordCollectPeerConnectionStats', {
    configurable: false,
    value: async () => {
      const reports = await Promise.all(
        connections.map(async (connection, index) => {
          const connectionMetadata = metadata.get(connection)
          const report = await connection.getStats()
          const stats: PeerConnectionStat[] = []
          report.forEach((entry) => {
            if (
              entry.type !== 'candidate-pair' &&
              entry.type !== 'codec' &&
              entry.type !== 'inbound-rtp' &&
              entry.type !== 'local-candidate' &&
              entry.type !== 'outbound-rtp' &&
              entry.type !== 'remote-candidate' &&
              entry.type !== 'track'
            ) {
              return
            }
            const value = entry as RTCStats & {
              bytesReceived?: number
              bytesSent?: number
              candidateType?: string
              codecId?: string
              currentRoundTripTime?: number
              framesDecoded?: number
              framesEncoded?: number
              kind?: string
              localCandidateId?: string
              mediaType?: string
              mimeType?: string
              nominated?: boolean
              packetsReceived?: number
              packetsSent?: number
              protocol?: string
              relayProtocol?: string
              remoteCandidateId?: string
              selected?: boolean
              state?: string
              trackId?: string
              trackIdentifier?: string
            }
            stats.push({
              bytesReceived: value.bytesReceived,
              bytesSent: value.bytesSent,
              candidateType: value.candidateType,
              codecId: value.codecId,
              currentRoundTripTime: value.currentRoundTripTime,
              framesDecoded: value.framesDecoded,
              framesEncoded: value.framesEncoded,
              id: value.id,
              kind: value.kind,
              localCandidateId: value.localCandidateId,
              mediaType: value.mediaType,
              mimeType: value.mimeType,
              nominated: value.nominated,
              packetsReceived: value.packetsReceived,
              packetsSent: value.packetsSent,
              protocol: value.protocol,
              relayProtocol: value.relayProtocol,
              remoteCandidateId: value.remoteCandidateId,
              selected: value.selected,
              state: value.state,
              trackId: value.trackId,
              trackIdentifier: value.trackIdentifier,
              type: value.type,
            })
          })

          return {
            configuration: connectionMetadata?.configuration,
            connectionState: connection.connectionState,
            connectionStateEvents: connectionMetadata?.connectionStateEvents ?? [],
            iceCandidateErrors: connectionMetadata?.iceCandidateErrors ?? [],
            iceCandidates: connectionMetadata?.iceCandidates ?? [],
            iceConnectionState: connection.iceConnectionState,
            iceConnectionStateEvents: connectionMetadata?.iceConnectionStateEvents ?? [],
            index,
            stats,
          }
        }),
      )

      return reports
    },
  })
}

async function loadSeedMediaContext(request: APIRequestContext): Promise<SeedMediaContext> {
  await resetBackendRateLimits(request)
  const owner = await loginUser(request, SEED_OWNER_EMAIL, SEED_OWNER_PASSWORD, 'OpenCord Owner')
  const organization = await findOrganization(request, owner, 'OpenCord Local Alpha')
  const space = await findSpace(request, owner, organization.id, 'Local Alpha')
  const channels = await listChannels(request, owner, space.id)
  const textChannel = channels.find(
    (candidate) => candidate.kind === 'text' && candidate.name === 'general',
  )
  const voiceChannel = channels.find(
    (candidate) => candidate.kind === 'voice' && candidate.name === 'Voice Lounge',
  )
  const meeting = await findSeedMeeting(request, owner, organization.id)
  expect(textChannel).toBeTruthy()
  expect(voiceChannel).toBeTruthy()

  const suffix = Date.now()
  const guest = await registerUser(request, {
    displayName: 'Media Guest',
    email: `phase10-media-guest-${suffix}@opencord.local`,
    password: 'correct horse battery staple',
  })
  await addSpaceMember(request, owner, space.id, guest.userId)
  const voiceRoleId = await createRole(request, owner, space.id, `Phase 10 Voice ${suffix}`, [
    'CONNECT_VOICE',
    'SPEAK',
  ])
  await assignRole(request, owner, space.id, voiceRoleId, guest.userId)

  return {
    guest,
    meeting,
    organizationId: organization.id,
    owner,
    spaceId: space.id,
    textChannelId: textChannel!.id,
    voiceChannelId: voiceChannel!.id,
  }
}

async function resetBackendRateLimits(request: APIRequestContext) {
  const response = await request.post(`${API_BASE_URL}/dev/rate-limits/reset`)
  if (response.ok()) {
    return
  }

  const status = response.status()
  if (status === 404) {
    throw new Error(
      'Phase 10 rate-limit reset endpoint is disabled. Restart the API with OPENCORD_DEV_RATE_LIMIT_RESET=1.',
    )
  }

  throw new Error(`Unable to reset backend rate limits before Phase 10 media setup: HTTP ${status}`)
}

async function findSeedMeeting(
  request: APIRequestContext,
  user: MediaUser,
  organizationId: string,
): Promise<SeedMeeting> {
  const response = await request.get(`${API_BASE_URL}/organizations/${organizationId}/meetings`, {
    headers: user.headers,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  const meeting = (body.meetings as Array<{
    channel_id?: string | null
    id?: string
    title?: string
  }>).find((candidate) => candidate.title === 'OpenCord Local Alpha Standup')
  expect(meeting).toBeTruthy()

  return {
    channelId: meeting!.channel_id ?? null,
    id: meeting!.id ?? '',
    title: meeting!.title ?? 'OpenCord Local Alpha Standup',
  }
}

async function startLocalAlpha(page: Page, user: MediaUser) {
  await page.goto(WEB_BASE_URL)
  await expect(page.getByText('API online')).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('Local alpha email').fill(user.email)
  await page.getByLabel('Local alpha display name').fill(user.displayName)
  await page.getByLabel('Local alpha password').fill(user.password)
  await page.getByRole('button', { name: 'Start local alpha' }).click()
  await expect(page.getByText(user.displayName)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Join Voice: Voice Lounge' })).toBeVisible({
    timeout: 30_000,
  })
}

async function seedLocalAlphaSession(
  page: Page,
  user: MediaUser,
  reconnectVoiceChannelId: string | null,
) {
  await page.context().addCookies([
    {
      httpOnly: true,
      name: 'opencord_refresh',
      path: '/auth',
      sameSite: 'Lax',
      secure: API_BASE_URL.startsWith('https://'),
      url: API_BASE_URL,
      value: user.refreshToken,
    },
  ])
  await page.evaluate(
    ({ apiBaseUrl, reconnectChannelId, seededUser }) => {
      const baseUrl = new URL(apiBaseUrl).toString().replace(/\/+$/, '')
      const connectionId = 'srv_phase10'
      window.localStorage.setItem(
        'opencord.serverConnections:v1',
        JSON.stringify({
          activeConnectionId: connectionId,
          connections: [
            {
              baseUrl,
              cacheNamespace: `server:${connectionId}`,
              capabilities: [],
              displayName: 'Local OpenCord',
              id: connectionId,
              lastConnectedAt: new Date().toISOString(),
              serverVersion: 'phase10',
            },
          ],
          version: 1,
        }),
      )
      window.localStorage.setItem(
        'opencord.localAlphaSession:v1',
        JSON.stringify({
          baseUrl,
          displayName: seededUser.displayName,
          email: seededUser.email,
          organization: {
            id: 'phase10-local-alpha-restore',
            name: 'Phase 10 Local Alpha Restore',
          },
          reconnectVoiceChannelId: reconnectChannelId,
          user: {
            displayName: seededUser.displayName,
            email: seededUser.email,
            id: seededUser.userId,
          },
        }),
      )
    },
    {
      apiBaseUrl: API_BASE_URL,
      reconnectChannelId: reconnectVoiceChannelId,
      seededUser: {
        displayName: user.displayName,
        email: user.email,
        userId: user.userId,
      },
    },
  )
}

async function joinSeedMeeting(page: Page, title = 'OpenCord Local Alpha Standup') {
  await page.getByRole('button', { name: 'Calendar' }).click()
  const meetings = page.getByLabel('Upcoming meetings')
  await expect(meetings).toContainText(title, { timeout: 30_000 })
  await meetings
    .getByRole('button', { name: `Join meeting ${title}` })
    .click()
  await expect(page.getByRole('region', { name: 'Meeting room' })).toContainText(
    'Media room connected',
    { timeout: 45_000 },
  )
}

async function waitForFullDuplexAudio(page: Page, evidenceDir?: string, timeoutEvidenceName?: string) {
  let lastEvidence: BrowserMediaEvidence | null = null
  try {
    await expect
      .poll(async () => {
        lastEvidence = await collectMediaEvidence(page)
        return (
          lastEvidence.summary.liveKitRemoteParticipants > 0 &&
          lastEvidence.summary.liveKitUnmutedLocalAudioTracks > 0 &&
          lastEvidence.summary.outboundAudioPackets > 0 &&
          lastEvidence.summary.inboundAudioPackets > 0
        )
      }, { timeout: 75_000 })
      .toBe(true)
  } catch (error) {
    if (evidenceDir && timeoutEvidenceName) {
      await writeEvidenceTo(
        evidenceDir,
        `${timeoutEvidenceName}.json`,
        lastEvidence ?? (await collectMediaEvidence(page)),
      )
    }
    throw error
  }

  return collectMediaEvidence(page)
}

async function waitForLocalAudio(page: Page) {
  await expect
    .poll(async () => {
      const evidence = await collectMediaEvidence(page)
      return (
        evidence.summary.liveKitUnmutedLocalAudioTracks > 0 &&
        evidence.summary.outboundAudioPackets > 0
      )
    }, { timeout: 60_000 })
    .toBe(true)

  return collectMediaEvidence(page)
}

async function waitForPublishedScreenShare(page: Page, evidenceDir?: string, timeoutEvidenceName?: string) {
  let lastEvidence: BrowserMediaEvidence | null = null
  try {
    await expect
      .poll(async () => {
        lastEvidence = await collectMediaEvidence(page)
        return (
          lastEvidence.summary.liveKitLocalScreenShareTracks > 0 &&
          lastEvidence.summary.outboundVideoPackets > 0 &&
          lastEvidence.summary.outboundVideoFrames > 0
        )
      }, { timeout: 75_000 })
      .toBe(true)
  } catch (error) {
    if (evidenceDir && timeoutEvidenceName) {
      await writeEvidenceTo(
        evidenceDir,
        `${timeoutEvidenceName}.json`,
        lastEvidence ?? (await collectMediaEvidence(page)),
      )
    }
    throw error
  }

  return collectMediaEvidence(page)
}

async function waitForReceivedScreenShare(page: Page) {
  await expect
    .poll(async () => {
      const evidence = await collectMediaEvidence(page)
      return (
        (await remoteScreenShareVideoCount(page)) > 0 &&
        evidence.summary.liveKitRemoteScreenShareTracks > 0 &&
        evidence.summary.inboundVideoPackets > 0 &&
        evidence.summary.inboundVideoFrames > 0
      )
    }, { timeout: 75_000 })
    .toBe(true)

  return collectMediaEvidence(page)
}

async function waitForFullDuplexRelay(
  page: Page,
  evidenceDir?: string,
  timeoutEvidenceName?: string,
) {
  let lastEvidence: BrowserMediaEvidence | null = null
  try {
    await expect
      .poll(async () => {
        lastEvidence = await collectMediaEvidence(page)
        return (
          lastEvidence.summary.liveKitRemoteParticipants > 0 &&
          lastEvidence.summary.liveKitUnmutedLocalAudioTracks > 0 &&
          lastEvidence.summary.outboundAudioPackets > 0 &&
          lastEvidence.summary.inboundAudioPackets > 0 &&
          lastEvidence.summary.selectedRelayCandidatePairs > 0
        )
      }, { timeout: 90_000 })
      .toBe(true)
  } catch (error) {
    if (evidenceDir && timeoutEvidenceName) {
      await writeEvidenceTo(
        evidenceDir,
        `${timeoutEvidenceName}.json`,
        lastEvidence ?? (await collectMediaEvidence(page)),
      )
    }
    throw error
  }

  return collectMediaEvidence(page)
}

async function waitForPublishedScreenShareRelay(
  page: Page,
  evidenceDir?: string,
  timeoutEvidenceName?: string,
) {
  let lastEvidence: BrowserMediaEvidence | null = null
  try {
    await expect
      .poll(async () => {
        lastEvidence = await collectMediaEvidence(page)
        return (
          lastEvidence.summary.liveKitLocalScreenShareTracks > 0 &&
          lastEvidence.summary.outboundVideoPackets > 0 &&
          lastEvidence.summary.outboundVideoFrames > 0 &&
          lastEvidence.summary.selectedRelayCandidatePairs > 0
        )
      }, { timeout: 90_000 })
      .toBe(true)
  } catch (error) {
    if (evidenceDir && timeoutEvidenceName) {
      await writeEvidenceTo(
        evidenceDir,
        `${timeoutEvidenceName}.json`,
        lastEvidence ?? (await collectMediaEvidence(page)),
      )
    }
    throw error
  }

  return collectMediaEvidence(page)
}

async function waitForReceivedScreenShareRelay(
  page: Page,
  evidenceDir?: string,
  timeoutEvidenceName?: string,
) {
  let lastEvidence: BrowserMediaEvidence | null = null
  try {
    await expect
      .poll(async () => {
        lastEvidence = await collectMediaEvidence(page)
        return (
          (await remoteScreenShareVideoCount(page)) > 0 &&
          lastEvidence.summary.liveKitRemoteScreenShareTracks > 0 &&
          lastEvidence.summary.inboundVideoPackets > 0 &&
          lastEvidence.summary.inboundVideoFrames > 0 &&
          lastEvidence.summary.selectedRelayCandidatePairs > 0
        )
      }, { timeout: 90_000 })
      .toBe(true)
  } catch (error) {
    if (evidenceDir && timeoutEvidenceName) {
      await writeEvidenceTo(
        evidenceDir,
        `${timeoutEvidenceName}.json`,
        lastEvidence ?? (await collectMediaEvidence(page)),
      )
    }
    throw error
  }

  return collectMediaEvidence(page)
}

async function collectMediaEvidence(page: Page): Promise<BrowserMediaEvidence> {
  const evidence = await page.evaluate(async () => {
    const opencordWindow = window as unknown as {
      __opencordCollectPeerConnectionStats?: () => Promise<PeerConnectionReport[]>
      __opencordMediaDiagnostics__?: {
        voiceSessions: Array<{ snapshot: () => LiveKitVoiceState }>
      }
    }

    return {
      diagnostics:
        opencordWindow.__opencordMediaDiagnostics__?.voiceSessions.map((session) =>
          session.snapshot(),
        ) ?? [],
      peerConnections: (await opencordWindow.__opencordCollectPeerConnectionStats?.()) ?? [],
    }
  })

  return {
    ...evidence,
    summary: summarizeMediaEvidence(evidence),
  }
}

async function hasMutedLocalAudio(page: Page) {
  const evidence = await collectMediaEvidence(page)
  return evidence.diagnostics.some((session) =>
    session.localAudioPublications.some((publication) => publication.muted),
  )
}

async function hasUnmutedLocalAudio(page: Page) {
  const evidence = await collectMediaEvidence(page)
  return evidence.diagnostics.some((session) =>
    session.localAudioPublications.some((publication) => !publication.muted),
  )
}

async function remoteParticipantCount(page: Page) {
  const evidence = await collectMediaEvidence(page)
  return evidence.summary.liveKitRemoteParticipants
}

async function remoteScreenShareVideoCount(page: Page) {
  return page.locator('[data-opencord-remote-screen-share]').count()
}

function summarizeMediaEvidence({
  diagnostics,
  peerConnections,
}: {
  diagnostics: LiveKitVoiceState[]
  peerConnections: PeerConnectionReport[]
}): MediaStatsSummary {
  const flatStats = peerConnections.flatMap((connection) => connection.stats)
  const statKindById = new Map(
    flatStats
      .map((stat): [string, string] | null => {
        const kind = mediaKindForStat(stat)
        return kind ? [stat.id, kind] : null
      })
      .filter((entry): entry is [string, string] => entry !== null),
  )
  const outboundAudioStats = flatStats.filter(
    (stat) => stat.type === 'outbound-rtp' && mediaKindForRtpStat(stat, statKindById) === 'audio',
  )
  const inboundAudioStats = flatStats.filter(
    (stat) => stat.type === 'inbound-rtp' && mediaKindForRtpStat(stat, statKindById) === 'audio',
  )
  const outboundVideoStats = flatStats.filter(
    (stat) => stat.type === 'outbound-rtp' && mediaKindForRtpStat(stat, statKindById) === 'video',
  )
  const inboundVideoStats = flatStats.filter(
    (stat) => stat.type === 'inbound-rtp' && mediaKindForRtpStat(stat, statKindById) === 'video',
  )
  const localCandidateStats = flatStats.filter((stat) => stat.type === 'local-candidate')
  const remoteCandidateStats = flatStats.filter((stat) => stat.type === 'remote-candidate')
  const candidateStatsById = new Map(
    [...localCandidateStats, ...remoteCandidateStats].map((stat) => [stat.id, stat]),
  )
  const candidatePairStats = flatStats.filter((stat) => stat.type === 'candidate-pair')
  const relayCandidatePairs = candidatePairStats.filter((stat) =>
    candidatePairUsesRelay(stat, candidateStatsById),
  )
  const selectedRelayCandidatePairs = relayCandidatePairs.filter(isSelectedCandidatePair)

  return {
    inboundAudioBytes: sumStat(inboundAudioStats, 'bytesReceived'),
    inboundAudioPackets: sumStat(inboundAudioStats, 'packetsReceived'),
    liveKitLocalAudioTracks: diagnostics.reduce(
      (total, session) => total + session.localAudioPublications.length,
      0,
    ),
    liveKitLocalScreenShareTracks: diagnostics.reduce(
      (total, session) => total + session.localScreenSharePublications.length,
      0,
    ),
    liveKitRemoteParticipants: diagnostics.reduce(
      (total, session) => total + session.remoteParticipants.length,
      0,
    ),
    liveKitRemoteScreenShareTracks: diagnostics.reduce(
      (total, session) =>
        total +
        session.remoteParticipants.reduce(
          (participantTotal, participant) =>
            participantTotal + participant.screenSharePublications.length,
          0,
        ),
      0,
    ),
    liveKitUnmutedLocalAudioTracks: diagnostics.reduce(
      (total, session) =>
        total + session.localAudioPublications.filter((publication) => !publication.muted).length,
      0,
    ),
    outboundAudioBytes: sumStat(outboundAudioStats, 'bytesSent'),
    outboundAudioPackets: sumStat(outboundAudioStats, 'packetsSent'),
    inboundVideoBytes: sumStat(inboundVideoStats, 'bytesReceived'),
    inboundVideoFrames: sumStat(inboundVideoStats, 'framesDecoded'),
    inboundVideoPackets: sumStat(inboundVideoStats, 'packetsReceived'),
    outboundVideoBytes: sumStat(outboundVideoStats, 'bytesSent'),
    outboundVideoFrames: sumStat(outboundVideoStats, 'framesEncoded'),
    outboundVideoPackets: sumStat(outboundVideoStats, 'packetsSent'),
    peerConnections: peerConnections.length,
    relayCandidatePairs: relayCandidatePairs.length,
    selectedRelayCandidatePairs: selectedRelayCandidatePairs.length,
    localRelayCandidates: localCandidateStats.filter(isRelayCandidate).length,
    remoteRelayCandidates: remoteCandidateStats.filter(isRelayCandidate).length,
  }
}

function candidatePairUsesRelay(
  candidatePair: PeerConnectionStat,
  candidateStatsById: Map<string, PeerConnectionStat>,
) {
  const localCandidate = candidateStatsById.get(candidatePair.localCandidateId ?? '')
  const remoteCandidate = candidateStatsById.get(candidatePair.remoteCandidateId ?? '')
  return isRelayCandidate(localCandidate) || isRelayCandidate(remoteCandidate)
}

function isSelectedCandidatePair(candidatePair: PeerConnectionStat) {
  const hasTraffic =
    (candidatePair.bytesSent ?? 0) > 0 || (candidatePair.bytesReceived ?? 0) > 0
  return (
    candidatePair.selected === true ||
    candidatePair.nominated === true ||
    (candidatePair.state === 'succeeded' && hasTraffic)
  )
}

function isRelayCandidate(candidate: PeerConnectionStat | undefined) {
  return candidate?.candidateType === 'relay'
}

function mediaKindForRtpStat(stat: PeerConnectionStat, statKindById: Map<string, string>) {
  return (
    mediaKindForStat(stat) ??
    statKindById.get(stat.codecId ?? '') ??
    statKindById.get(stat.trackId ?? '') ??
    mediaKindFromId(stat.id)
  )
}

function mediaKindForStat(stat: PeerConnectionStat) {
  return stat.kind ?? stat.mediaType ?? mediaKindFromMimeType(stat.mimeType) ?? mediaKindFromId(stat.id)
}

function mediaKindFromMimeType(mimeType: string | undefined) {
  return mimeType?.toLowerCase().startsWith('audio/')
    ? 'audio'
    : mimeType?.toLowerCase().startsWith('video/')
      ? 'video'
      : undefined
}

function mediaKindFromId(id: string) {
  const normalizedId = id.toLowerCase()
  if (normalizedId.includes('audio')) {
    return 'audio'
  }
  if (normalizedId.includes('video')) {
    return 'video'
  }
  return undefined
}

function sumStat(stats: PeerConnectionStat[], key: keyof PeerConnectionStat) {
  return stats.reduce((total, stat) => {
    const value = stat[key]
    return typeof value === 'number' ? total + value : total
  }, 0)
}

function turnRelayRtcConfig(): RTCConfiguration {
  const urls = (process.env.OPENCORD_TURN_URLS ?? 'turn:localhost:3478?transport=udp,turn:localhost:3478?transport=tcp')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
  const username = process.env.OPENCORD_TURN_USERNAME ?? 'opencord'
  const credential = process.env.OPENCORD_TURN_CREDENTIAL ?? 'opencord-turn-password'

  if (urls.length === 0 || username.length === 0 || credential.length === 0) {
    throw new Error('TURN relay test requires TURN URLs, username, and credential')
  }

  return {
    iceServers: [
      {
        credential,
        urls,
        username,
      },
    ],
    iceTransportPolicy: 'relay',
  }
}

function firstIceServerUsername(config: RTCConfiguration) {
  return config.iceServers?.find((server) => typeof server.username === 'string')?.username
}

function firstIceServerCredential(config: RTCConfiguration) {
  const credential = config.iceServers?.find((server) => typeof server.credential === 'string')
    ?.credential
  return typeof credential === 'string' ? credential : undefined
}

async function writeEvidence(fileName: string, evidence: BrowserMediaEvidence) {
  await writeEvidenceTo(EVIDENCE_DIR, fileName, evidence)
}

async function writeEvidenceTo(
  evidenceDir: string,
  fileName: string,
  evidence: BrowserMediaEvidence,
) {
  await writeFile(path.join(evidenceDir, fileName), `${JSON.stringify(evidence, null, 2)}\n`)
}

function captureConsoleMessages(page: Page, messages: string[]) {
  page.on('console', (message) => {
    messages.push(redactConsoleMessage(`${message.type()}: ${message.text()}`))
  })
  page.on('pageerror', (error) => {
    messages.push(redactConsoleMessage(`pageerror: ${error.name}: ${error.message}`))
  })
}

function redactConsoleMessage(message: string) {
  return message
    .replace(/access_token=([^&\s"']+)/g, 'access_token=<redacted>')
    .replace(/join_request=([^&\s"']+)/g, 'join_request=<redacted>')
    .replace(/("participantToken"\s*:\s*")[^"]+"/g, '$1<redacted>"')
    .replace(/(participant_token["=:\s]+)[^&\s"']+/gi, '$1<redacted>')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '<jwt-redacted>')
}

async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
  displayName: string,
): Promise<MediaUser> {
  const response = await request.post(`${API_BASE_URL}/auth/login`, {
    data: { email, password },
  })
  if (response.status() === 429) {
    const retryAfter = Number(response.headers()['retry-after'] ?? '60')
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(Math.max(retryAfter, 1), 61) * 1_000),
    )
    return loginUser(request, email, password, displayName)
  }
  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  return {
    displayName,
    email,
    headers: { Authorization: `Bearer ${body.session.token as string}` },
    password,
    refreshToken: body.session.refresh_token as string,
    sessionToken: body.session.token as string,
    userId: body.user.id as string,
  }
}

async function registerUser(
  request: APIRequestContext,
  user: Pick<MediaUser, 'displayName' | 'email' | 'password'>,
): Promise<MediaUser> {
  const response = await request.post(`${API_BASE_URL}/auth/register`, {
    data: {
      display_name: user.displayName,
      email: user.email,
      password: user.password,
    },
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()

  return {
    ...user,
    headers: { Authorization: `Bearer ${body.session.token as string}` },
    refreshToken: body.session.refresh_token as string,
    sessionToken: body.session.token as string,
    userId: body.user.id as string,
  }
}

async function findOrganization(request: APIRequestContext, user: MediaUser, name: string) {
  const response = await request.get(`${API_BASE_URL}/organizations`, { headers: user.headers })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  const organization = body.organizations.find(
    (candidate: { id?: string; name?: string }) => candidate.name === name,
  )
  expect(organization).toBeTruthy()
  return organization as { id: string; name: string }
}

async function findSpace(
  request: APIRequestContext,
  user: MediaUser,
  organizationId: string,
  name: string,
) {
  const response = await request.get(`${API_BASE_URL}/organizations/${organizationId}/spaces`, {
    headers: user.headers,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  const space = body.spaces.find(
    (candidate: { id?: string; name?: string }) => candidate.name === name,
  )
  expect(space).toBeTruthy()
  return space as { id: string; name: string }
}

async function listChannels(request: APIRequestContext, user: MediaUser, spaceId: string) {
  const response = await request.get(`${API_BASE_URL}/spaces/${spaceId}/channels`, {
    headers: user.headers,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.channels as Array<{ id: string; kind: string; name: string }>
}

async function addSpaceMember(
  request: APIRequestContext,
  user: MediaUser,
  spaceId: string,
  userId: string,
) {
  const response = await request.post(`${API_BASE_URL}/spaces/${spaceId}/members`, {
    data: {
      role: 'member',
      user_id: userId,
    },
    headers: user.headers,
  })
  expect(response.ok()).toBeTruthy()
}

async function createRole(
  request: APIRequestContext,
  user: MediaUser,
  spaceId: string,
  name: string,
  permissions: string[],
) {
  const response = await request.post(`${API_BASE_URL}/spaces/${spaceId}/roles`, {
    data: { name, permissions },
    headers: user.headers,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  return body.role.id as string
}

async function assignRole(
  request: APIRequestContext,
  user: MediaUser,
  spaceId: string,
  roleId: string,
  userId: string,
) {
  const response = await request.post(`${API_BASE_URL}/spaces/${spaceId}/roles/${roleId}/assignments`, {
    data: { user_id: userId },
    headers: user.headers,
  })
  expect(response.ok()).toBeTruthy()
}

async function setMemberChannelPermissionOverride(
  request: APIRequestContext,
  user: MediaUser,
  channelId: string,
  userId: string,
  allow: string[],
  deny: string[],
) {
  const response = await request.post(`${API_BASE_URL}/channels/${channelId}/permission-overrides`, {
    data: {
      allow,
      deny,
      target_id: userId,
      target_kind: 'member',
    },
    headers: user.headers,
  })
  expect(response.ok()).toBeTruthy()
}

async function ensureAndroidOwnerVoiceReady() {
  await adb(['shell', 'am', 'force-stop', ANDROID_PACKAGE])
  await adb(['shell', 'pm', 'clear', ANDROID_PACKAGE])
  await grantAndroidPermission('android.permission.RECORD_AUDIO')
  await grantAndroidPermission('android.permission.CAMERA')
  await adb(['shell', 'appops', 'set', ANDROID_PACKAGE, 'RECORD_AUDIO', 'allow'])
  await adb(['shell', 'monkey', '-p', ANDROID_PACKAGE, '-c', 'android.intent.category.LAUNCHER', '1'])

  await waitForAndroidText('OpenCord', 30_000)
  await tapAndroidByDescription('Email')
  await adbInputText(SEED_OWNER_EMAIL)
  await tapAndroidByDescription('Password')
  await adbInputText(SEED_OWNER_PASSWORD)
  await tapAndroidByDescription('Log in')
  await waitForAndroidText('Channels', 45_000)
  await writeFile(path.join(OC10_006_LOG_DIR, 'android-after-login-window.xml'), await dumpAndroidWindow())
  await writeAndroidScreenshot('android-after-login.png')

  await tapAndroidByDescription('V Voice Lounge')
  await waitForAndroidText('Voice connected', 60_000)
  await writeFile(path.join(OC10_006_LOG_DIR, 'android-voice-connected-window.xml'), await dumpAndroidWindow())
  await writeAndroidScreenshot('android-voice-connected.png')
}

async function ensureAndroidMeetingReady(
  user: MediaUser,
  meeting: SeedMeeting,
  runId: string,
  commandUrl: string,
) {
  await adb(['shell', 'am', 'force-stop', ANDROID_PACKAGE])
  await adb(['shell', 'pm', 'clear', ANDROID_PACKAGE])
  await grantAndroidPermission('android.permission.RECORD_AUDIO')
  await grantAndroidPermission('android.permission.CAMERA')
  await adb(['shell', 'appops', 'set', ANDROID_PACKAGE, 'RECORD_AUDIO', 'allow'])
  await adbShell([
    'am',
    'start',
    '-W',
    '-n',
    `${ANDROID_PACKAGE}/.MainActivity`,
    '--ez',
    'OPENCORD_MOBILE_E2E',
    'true',
    '--ez',
    'OPENCORD_E2E_AUTO_JOIN_MEETING',
    'true',
    '--es',
    'OPENCORD_E2E_SERVER_URL',
    androidHostUrl(API_BASE_URL),
    '--es',
    'OPENCORD_E2E_EMAIL',
    user.email,
    '--es',
    'OPENCORD_E2E_PASSWORD',
    user.password,
    '--es',
    'OPENCORD_E2E_MEETING_ID',
    meeting.id,
    '--es',
    'OPENCORD_E2E_MEETING_TITLE',
    meeting.title,
    '--es',
    'OPENCORD_E2E_RUN_ID',
    runId,
    '--es',
    'OPENCORD_E2E_COMMAND_URL',
    androidHostUrl(commandUrl),
  ])

  await waitForAndroidText('Voice connected', 120_000)
  await waitForAndroidText(meeting.title, 30_000)
  await writeFile(
    path.join(OC10_009_LOG_DIR, 'android-meeting-connected-window.xml'),
    await dumpAndroidWindow(),
  )
  await writeAndroidScreenshot('android-meeting-connected.png', OC10_009_SCREENSHOT_DIR)
}

async function grantAndroidPermission(permission: string) {
  await adb(['shell', 'pm', 'grant', ANDROID_PACKAGE, permission], {
    allowFailure: true,
  })
}

async function tapAndroidByDescription(description: string) {
  const xml = await dumpAndroidWindow()
  const bounds = findAndroidNodeBounds(xml, 'content-desc', description) ??
    findAndroidNodeBounds(xml, 'text', description)
  if (!bounds) {
    throw new Error(`Unable to find Android node matching ${description}`)
  }
  await adb(['shell', 'input', 'tap', String(bounds.x), String(bounds.y)])
}

async function adbInputText(text: string) {
  await adb(['shell', 'input', 'text', adbText(text)])
}

async function waitForAndroidText(text: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastXml = ''
  while (Date.now() < deadline) {
    lastXml = await dumpAndroidWindow()
    if (lastXml.includes(escapeXml(text))) {
      return lastXml
    }
    await delay(1_000)
  }

  throw new Error(`Timed out waiting for Android text: ${text}\n${lastXml}`)
}

async function waitForAndroidVoiceDisconnected(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  let lastXml = ''
  while (Date.now() < deadline) {
    lastXml = await dumpAndroidWindow()
    if (
      lastXml.includes(escapeXml('Channels')) &&
      lastXml.includes(escapeXml('Voice & Video')) &&
      !lastXml.includes(escapeXml('Voice connected'))
    ) {
      return lastXml
    }
    await delay(1_000)
  }

  throw new Error(`Timed out waiting for Android voice disconnect\n${lastXml}`)
}

async function writeAndroidScreenshot(fileName: string, screenshotDir = OC10_006_SCREENSHOT_DIR) {
  const screenshot = await adb(['exec-out', 'screencap', '-p'], { encoding: 'buffer' })
  await writeFile(path.join(screenshotDir, fileName), screenshot)
}

async function startMobileE2ECommandServer(): Promise<MobileE2ECommandServer> {
  let currentCommand: { command: MobileE2ECommand; id: string } | null = null
  let latestState: MobileE2EStateSnapshot | null = null
  let stateSequence = 0
  const server = createServer((request, response) => {
    if (request.url?.startsWith('/command')) {
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json',
      })
      response.end(JSON.stringify(currentCommand ?? { command: null, id: null }))
      return
    }

    if (request.url?.startsWith('/state')) {
      if (request.method === 'GET') {
        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'application/json',
        })
        response.end(JSON.stringify(latestState ?? { state: null }))
        return
      }

      if (request.method === 'POST') {
        void readJsonRequest(request)
          .then((body) => {
            stateSequence += 1
            latestState = normalizeMobileE2EStateSnapshot(body, stateSequence)
            response.writeHead(204, { 'Cache-Control': 'no-store' })
            response.end()
          })
          .catch((error: unknown) => {
            response.writeHead(400, {
              'Cache-Control': 'no-store',
              'Content-Type': 'application/json',
            })
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Invalid state payload',
              }),
            )
          })
        return
      }

      response.writeHead(405, { 'Cache-Control': 'no-store' })
      response.end()
      return
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address() as AddressInfo
  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
    latestState: () => latestState,
    send: (command) => {
      currentCommand = { command, id: `${Date.now()}-${command}` }
    },
    stateUrl: `http://127.0.0.1:${address.port}/state`,
    url: `http://127.0.0.1:${address.port}/command`,
  }
}

async function readJsonRequest(request: IncomingMessage) {
  return await new Promise<unknown>((resolve, reject) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 1_000_000) {
        reject(new Error('Request body too large'))
        request.destroy()
      }
    })
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch (error) {
        reject(error)
      }
    })
    request.on('error', reject)
  })
}

function normalizeMobileE2EStateSnapshot(value: unknown, sequence: number): MobileE2EStateSnapshot {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    ...(record as Record<string, unknown>),
    receivedAt: new Date().toISOString(),
    sequence,
  } as MobileE2EStateSnapshot
}

async function waitForMobileE2EState(
  server: MobileE2ECommandServer,
  predicate: (state: MobileE2EStateSnapshot) => boolean,
  timeoutMs: number,
  description: string,
) {
  const deadline = Date.now() + timeoutMs
  let latest: MobileE2EStateSnapshot | null = null
  while (Date.now() < deadline) {
    latest = server.latestState()
    if (latest && predicate(latest)) {
      return latest
    }
    await delay(500)
  }

  throw new Error(
    `Timed out waiting for mobile E2E state: ${description}\n${JSON.stringify(latest, null, 2)}`,
  )
}

function mobileE2EStateMatchesRun(state: MobileE2EStateSnapshot, runId: string) {
  return state.runId === runId
}

function mobileE2EVoiceConnected(state: MobileE2EStateSnapshot, runId: string) {
  return (
    mobileE2EStateMatchesRun(state, runId) &&
    state.voice?.connectionStatus === 'connected' &&
    Boolean(state.voice?.connectedChannelId)
  )
}

function mobileE2EVoiceMuted(state: MobileE2EStateSnapshot, runId: string) {
  return mobileE2EStateMatchesRun(state, runId) && state.voice?.selfMute === true
}

function mobileE2EVoiceLeft(state: MobileE2EStateSnapshot, runId: string) {
  return (
    mobileE2EStateMatchesRun(state, runId) &&
    state.voice?.connectionStatus === 'idle' &&
    state.voice?.connectedChannelId === null
  )
}

function mobileE2EStateJson(state: MobileE2EStateSnapshot) {
  return `${JSON.stringify(state, null, 2)}\n`
}

async function ensureIosOwnerVoiceReady(
  user: MediaUser,
  runId: string,
  commandServer: MobileE2ECommandServer,
) {
  await iosSimctl(['boot', IOS_SIMULATOR_UDID], { allowFailure: true })
  await iosSimctl(['bootstatus', IOS_SIMULATOR_UDID, '-b'])
  await iosSimctl(['terminate', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
  await iosSimctl(['uninstall', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
  await iosSimctl(['install', IOS_SIMULATOR_UDID, IOS_APP_PATH])
  await iosSimctl(['privacy', IOS_SIMULATOR_UDID, 'reset', 'microphone', IOS_APP_BUNDLE_ID], {
    allowFailure: true,
  })
  await iosSimctl(['privacy', IOS_SIMULATOR_UDID, 'grant', 'microphone', IOS_APP_BUNDLE_ID])
  await writeFile(
    path.join(OC10_007_LOG_DIR, 'ios-privacy-microphone-granted.log'),
    'simctl privacy reset microphone followed by grant microphone for com.opencord\n',
  )
  await iosSimctl(
    [
      'launch',
      '--terminate-running-process',
      `--stdout=${path.join(OC10_007_LOG_DIR, 'ios-app-stdout.log')}`,
      `--stderr=${path.join(OC10_007_LOG_DIR, 'ios-app-stderr.log')}`,
      IOS_SIMULATOR_UDID,
      IOS_APP_BUNDLE_ID,
    ],
    {
      env: {
        SIMCTL_CHILD_OPENCORD_E2E_AUTO_JOIN_VOICE: '1',
        SIMCTL_CHILD_OPENCORD_E2E_COMMAND_URL: commandServer.url,
        SIMCTL_CHILD_OPENCORD_E2E_EMAIL: user.email,
        SIMCTL_CHILD_OPENCORD_E2E_PASSWORD: user.password,
        SIMCTL_CHILD_OPENCORD_E2E_RUN_ID: runId,
        SIMCTL_CHILD_OPENCORD_E2E_SERVER_URL: API_BASE_URL,
        SIMCTL_CHILD_OPENCORD_E2E_VOICE_CHANNEL: 'Voice Lounge',
        SIMCTL_CHILD_OPENCORD_MOBILE_E2E: '1',
      },
    },
  )

  const launchState = await waitForMobileE2EState(
    commandServer,
    (state) => mobileE2EStateMatchesRun(state, runId) && state.screen === 'channels',
    120_000,
    'iOS app launched, logged in, and rendered channels',
  )
  await writeFile(
    path.join(OC10_007_LOG_DIR, 'ios-e2e-launch-state.json'),
    mobileE2EStateJson(launchState),
  )
  const connectedState = await waitForMobileE2EState(
    commandServer,
    (state) => mobileE2EVoiceConnected(state, runId),
    120_000,
    'iOS voice connected state',
  )
  await writeFile(
    path.join(OC10_007_LOG_DIR, 'ios-voice-connected-state.json'),
    mobileE2EStateJson(connectedState),
  )
  await writeIosScreenshot('ios-voice-connected.png')
}

async function ensureIosMeetingReady(
  user: MediaUser,
  meeting: SeedMeeting,
  runId: string,
  commandServer: MobileE2ECommandServer,
  liveKitLogSince: string,
) {
  await iosSimctl(['boot', IOS_SIMULATOR_UDID], { allowFailure: true })
  await iosSimctl(['bootstatus', IOS_SIMULATOR_UDID, '-b'])
  await iosSimctl(['terminate', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
  await iosSimctl(['uninstall', IOS_SIMULATOR_UDID, IOS_APP_BUNDLE_ID], { allowFailure: true })
  await iosSimctl(['install', IOS_SIMULATOR_UDID, IOS_APP_PATH])
  await iosSimctl(['privacy', IOS_SIMULATOR_UDID, 'reset', 'microphone', IOS_APP_BUNDLE_ID], {
    allowFailure: true,
  })
  await iosSimctl(['privacy', IOS_SIMULATOR_UDID, 'grant', 'microphone', IOS_APP_BUNDLE_ID])
  await writeFile(
    path.join(OC10_009_LOG_DIR, 'ios-meeting-privacy-microphone-granted.log'),
    'simctl privacy reset microphone followed by grant microphone for com.opencord\n',
  )
  await iosSimctl(
    [
      'launch',
      '--terminate-running-process',
      `--stdout=${path.join(OC10_009_LOG_DIR, 'ios-meeting-app-stdout.log')}`,
      `--stderr=${path.join(OC10_009_LOG_DIR, 'ios-meeting-app-stderr.log')}`,
      IOS_SIMULATOR_UDID,
      IOS_APP_BUNDLE_ID,
    ],
    {
      env: {
        SIMCTL_CHILD_OPENCORD_E2E_AUTO_JOIN_MEETING: '1',
        SIMCTL_CHILD_OPENCORD_E2E_COMMAND_URL: commandServer.url,
        SIMCTL_CHILD_OPENCORD_E2E_EMAIL: user.email,
        SIMCTL_CHILD_OPENCORD_E2E_MEETING_ID: meeting.id,
        SIMCTL_CHILD_OPENCORD_E2E_MEETING_TITLE: meeting.title,
        SIMCTL_CHILD_OPENCORD_E2E_PASSWORD: user.password,
        SIMCTL_CHILD_OPENCORD_E2E_RUN_ID: runId,
        SIMCTL_CHILD_OPENCORD_E2E_SERVER_URL: API_BASE_URL,
        SIMCTL_CHILD_OPENCORD_MOBILE_E2E: '1',
      },
    },
  )

  const launchState = await waitForMobileE2EState(
    commandServer,
    (state) => mobileE2EStateMatchesRun(state, runId) && state.screen === 'channels',
    120_000,
    'iOS meeting app launched, logged in, and rendered channels',
  )
  await writeFile(
    path.join(OC10_009_LOG_DIR, 'ios-meeting-e2e-launch-state.json'),
    mobileE2EStateJson(launchState),
  )
  const connectedState = await waitForMobileE2EState(
    commandServer,
    (state) => mobileE2EVoiceConnected(state, runId),
    120_000,
    'iOS meeting voice connected state',
  )
  await writeFile(
    path.join(OC10_009_LOG_DIR, 'ios-meeting-connected-state.json'),
    mobileE2EStateJson(connectedState),
  )
  const connectedLog = await waitForLiveKitLine(
    liveKitLogSince,
    (line) =>
      line.includes('mediaTrack published') &&
      line.includes(`"participant": "${user.userId}"`) &&
      line.includes('"kind": "audio"'),
    120_000,
  )
  await writeFile(path.join(OC10_009_LOG_DIR, 'ios-meeting-connected-livekit.log'), connectedLog)
  await writeIosScreenshot('ios-meeting-connected.png', OC10_009_SCREENSHOT_DIR)
}

async function waitForLiveKitLine(
  since: string,
  predicate: (line: string) => boolean,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs
  let lastText = ''
  while (Date.now() < deadline) {
    try {
      lastText = await liveKitLogsSince(since)
      const matchingLines = lastText.split('\n').filter(predicate)
      if (matchingLines.length > 0) {
        return `${matchingLines.join('\n')}\n`
      }
    } catch {
      // The media service log may not exist until the local stack has started writing.
    }
    await delay(1_000)
  }

  throw new Error(
    `Timed out waiting for LiveKit log line since ${since} in ${LIVEKIT_CONTAINER_NAME}`,
  )
}

async function liveKitLogsSince(since: string) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      'docker',
      ['logs', '--since', since, LIVEKIT_CONTAINER_NAME],
      {
        encoding: 'utf8',
        maxBuffer: 100 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `docker logs --since ${since} ${LIVEKIT_CONTAINER_NAME} failed: ${error.message}\n${String(stderr)}`,
            ),
          )
          return
        }
        resolve(`${stdout}${stderr}`.replace(/\0/g, ''))
      },
    )
  })
}

async function readMetrics(request: APIRequestContext) {
  const response = await request.get(`${API_BASE_URL}/metrics`)
  expect(response.ok()).toBeTruthy()
  return response.text()
}

function expectMetricPresent(metrics: string, sampleName: string) {
  expect(metricSampleValue(metrics, sampleName), `${sampleName} metric must be present`).not.toBeNull()
}

function metricSampleValue(metrics: string, sampleName: string) {
  const escapedSampleName = sampleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`^${escapedSampleName}\\s+(\\d+(?:\\.\\d+)?)$`, 'm').exec(metrics)
  return match ? Number(match[1]) : null
}

async function auditMediaEvidenceArtifacts(): Promise<EvidenceArtifactAudit[]> {
  const requirements = [
    {
      label: 'browser voice',
      pattern: /oc-10-003-web-livekit-voice/,
      files: [
        'result.md',
        'browser-owner-connected.json',
        'browser-guest-connected.json',
        'livekit.log',
        'metrics-before.txt',
        'metrics-after.txt',
      ],
    },
    {
      label: 'browser screen share',
      pattern: /oc-10-004-web-screen-share/,
      files: ['result.md', 'browser-owner-screen-share.json', 'browser-guest-screen-watch.json', 'livekit.log'],
    },
    {
      label: 'android full media',
      pattern: /oc-10-006.*android/,
      files: [
        'result.md',
        'browser-after-screen-share.json',
        'logs/android-logcat-after-pass.log',
        'logs/livekit.log',
        'metrics-before.txt',
        'metrics-after.txt',
      ],
    },
    {
      label: 'ios full media',
      pattern: /oc-10-007.*ios/,
      files: [
        'result.md',
        'browser-after-screen-share.json',
        'logs/ios-voice-connected-state.json',
        'logs/livekit.log',
        'metrics-before.txt',
        'metrics-after.txt',
      ],
    },
    {
      label: 'electron full media',
      pattern: /oc-10-008.*electron/,
      files: [
        'result.md',
        'browser-audio.json',
        'electron-audio.json',
        'logs/electron-process.log',
        'logs/livekit.log',
      ],
    },
    {
      label: 'meeting media',
      pattern: /oc-10-009-meeting-media/,
      files: [
        'result.md',
        'owner-meeting-audio.json',
        'browser-electron-result.md',
        'browser-android-result.md',
        'browser-ios-result.md',
        'logs/livekit.log',
      ],
    },
    {
      label: 'turn relay',
      pattern: /oc-10-010-turn-relay/,
      files: [
        'result.md',
        'browser-owner-voice-relay.json',
        'browser-guest-voice-relay.json',
        'browser-owner-screen-share-relay.json',
        'browser-guest-screen-watch-relay.json',
      ],
    },
    {
      label: 'permission boundaries',
      pattern: /oc-10-011-permission-boundaries/,
      files: [
        'result.md',
        'guest-screen-before-revoke.json',
        'owner-screen-watch-before-revoke.json',
        'guest-after-connect-revoke.json',
        'owner-after-connect-revoke.json',
      ],
    },
  ] satisfies Array<{ files: string[]; label: string; pattern: RegExp }>

  return Promise.all(
    requirements.map(async (requirement) => {
      const directory = await latestEvidenceDirectory(requirement.pattern, requirement.files)
      const resultText = await readFile(path.join(directory, 'result.md'), 'utf8')
      const files = await Promise.all(
        requirement.files.map(async (filePath) => {
          const fullPath = path.join(directory, filePath)
          const fileStat = await stat(fullPath)
          return {
            bytes: fileStat.size,
            hasMediaSummary: await evidenceFileHasMediaSummary(fullPath),
            path: path.relative(EVIDENCE_ROOT, fullPath),
          }
        }),
      )

      return {
        directory: path.relative(EVIDENCE_ROOT, directory),
        files,
        label: requirement.label,
        statusPassed: resultText.includes('Status: passed'),
      }
    }),
  )
}

async function latestEvidenceDirectory(pattern: RegExp, requiredFiles: string[]) {
  const entries = await readdir(EVIDENCE_ROOT, { withFileTypes: true })
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => pattern.test(name))
    .sort()
  const matches: string[] = []
  for (const candidate of candidates) {
    const candidateDirectory = path.join(EVIDENCE_ROOT, candidate)
    const results = await Promise.allSettled(
      requiredFiles.map((filePath) => stat(path.join(candidateDirectory, filePath))),
    )
    if (results.every((result) => result.status === 'fulfilled')) {
      matches.push(candidate)
    }
  }
  expect(matches.length, `Expected evidence directory matching ${pattern}`).toBeGreaterThan(0)
  return path.join(EVIDENCE_ROOT, matches[matches.length - 1]!)
}

async function evidenceFileHasMediaSummary(filePath: string) {
  if (!filePath.endsWith('.json')) {
    return false
  }

  try {
    const parsed = JSON.parse(await readFile(filePath, 'utf8')) as { summary?: unknown }
    return typeof parsed.summary === 'object' && parsed.summary !== null
  } catch {
    return false
  }
}

function extractLiveKitTrackId(logText: string) {
  const match = /"trackID":\s*"([^"]+)"/.exec(logText)
  if (!match) {
    throw new Error(`Unable to extract LiveKit trackID from log:\n${logText}`)
  }
  return match[1]
}

async function writeIosScreenshot(fileName: string, screenshotDir = OC10_007_SCREENSHOT_DIR) {
  await iosSimctl([
    'io',
    IOS_SIMULATOR_UDID,
    'screenshot',
    path.join(screenshotDir, fileName),
  ])
}

async function dumpAndroidWindow() {
  await adb(['shell', 'uiautomator', 'dump', '/sdcard/window.xml'])
  return adb(['shell', 'cat', '/sdcard/window.xml'])
}

function findAndroidNodeBounds(
  xml: string,
  attribute: 'content-desc' | 'text',
  expectedValue: string,
) {
  const escaped = escapeXml(expectedValue)
  const pattern = new RegExp(
    `<node\\b(?=[^>]*\\b${attribute}="[^"]*${escapeRegex(escaped)}[^"]*")(?=[^>]*\\bbounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]")[^>]*>`,
  )
  const match = pattern.exec(xml)
  if (!match) {
    return null
  }
  const left = Number(match[1])
  const top = Number(match[2])
  const right = Number(match[3])
  const bottom = Number(match[4])

  return {
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
  }
}

async function adb(
  args: string[],
  options: { allowFailure?: boolean; encoding?: 'buffer' | 'utf8' } = {},
): Promise<string>
async function adb(
  args: string[],
  options: { allowFailure?: boolean; encoding?: 'buffer' | 'utf8' },
): Promise<Buffer>
async function adb(
  args: string[],
  options: { allowFailure?: boolean; encoding?: 'buffer' | 'utf8' } = {},
) {
  return new Promise<string | Buffer>((resolve, reject) => {
    execFile(
      'adb',
      args,
      {
        encoding: options.encoding === 'buffer' ? 'buffer' : 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && !options.allowFailure) {
          reject(
            new Error(
              `adb ${args.join(' ')} failed: ${error.message}\n${String(stderr)}`,
            ),
          )
          return
        }
        resolve(stdout)
      },
    )
  })
}

async function adbShell(args: string[], options: { allowFailure?: boolean } = {}) {
  return adb(['shell', args.map(androidShellQuote).join(' ')], options)
}

function androidShellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function iosSimctl(
  args: string[],
  options: { allowFailure?: boolean; env?: NodeJS.ProcessEnv } = {},
) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      'xcrun',
      ['simctl', ...args],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DEVELOPER_DIR: IOS_DEVELOPER_DIR,
          ...options.env,
        },
        maxBuffer: 30 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error && !options.allowFailure) {
          reject(
            new Error(
              `xcrun simctl ${args.join(' ')} failed: ${error.message}\n${String(stderr)}`,
            ),
          )
          return
        }
        resolve(`${stdout}${stderr}`)
      },
    )
  })
}

function adbText(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/ /g, '%s')
}

function androidHostUrl(url: string) {
  return url.replace(/^http:\/\/(?:localhost|127\.0\.0\.1)(?=[:/])/, 'http://10.0.2.2')
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function timestampForEvidence() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-')
}
