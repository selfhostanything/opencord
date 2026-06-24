import { describe, expect, it } from 'vitest'

import {
  mobileE2ECommandFromUrl,
  mobileE2EStateUrl,
  normalizeMobileE2ECommand,
  normalizeMobileE2ELaunchConfig,
  shouldAutoJoinMobileVoice,
} from './mobileE2E'

describe('mobile e2e launch config', () => {
  it('rejects disabled or incomplete launch props', () => {
    expect(normalizeMobileE2ELaunchConfig(undefined)).toBeNull()
    expect(normalizeMobileE2ELaunchConfig({ enabled: false })).toBeNull()
    expect(
      normalizeMobileE2ELaunchConfig({
        enabled: true,
        email: 'owner@opencord.local',
        password: 'correct horse battery staple',
      }),
    ).toBeNull()
  })

  it('allows seeded workspace launch props for navigation smoke without a backend login', () => {
    expect(
      normalizeMobileE2ELaunchConfig({
        demoWorkspace: true,
        enabled: true,
        email: ' owner@opencord.local ',
        serverUrl: ' http://localhost:8080 ',
      }),
    ).toEqual({
      autoJoinMeeting: false,
      autoJoinVoice: false,
      commandUrl: null,
      demoWorkspace: true,
      email: 'owner@opencord.local',
      meetingId: null,
      meetingTitle: null,
      password: '',
      preferredVoiceChannelName: null,
      rememberDevice: true,
      runId: null,
      serverUrl: 'http://localhost:8080',
    })
  })

  it('normalizes simulator launch props for repeatable media automation', () => {
    expect(
      normalizeMobileE2ELaunchConfig({
        autoJoinVoice: true,
        enabled: true,
        email: ' owner@opencord.local ',
        password: 'correct horse battery staple',
        commandUrl: ' http://127.0.0.1:19007/command ',
        autoJoinMeeting: true,
        meetingId: ' 019ef679-3187-7331-a2bd-aa8b5ade1e57 ',
        meetingTitle: ' OpenCord Local Alpha Standup ',
        preferredVoiceChannelName: ' Voice Lounge ',
        rememberDevice: false,
        serverUrl: ' http://localhost:8080 ',
      }),
    ).toEqual({
      autoJoinMeeting: true,
      autoJoinVoice: true,
      commandUrl: 'http://127.0.0.1:19007/command',
      demoWorkspace: false,
      email: 'owner@opencord.local',
      meetingId: '019ef679-3187-7331-a2bd-aa8b5ade1e57',
      meetingTitle: 'OpenCord Local Alpha Standup',
      password: 'correct horse battery staple',
      preferredVoiceChannelName: 'Voice Lounge',
      rememberDevice: false,
      runId: null,
      serverUrl: 'http://localhost:8080',
    })
  })

  it('selects the preferred voice channel when auto joining', () => {
    const channels = [
      { id: 'general', kind: 'text' as const, name: 'general', topic: '', unread: false },
      { id: 'standup', kind: 'voice' as const, name: 'standup', topic: '', unread: false },
      { id: 'voice-lounge', kind: 'voice' as const, name: 'Voice Lounge', topic: '', unread: false },
    ]

    expect(
      shouldAutoJoinMobileVoice({
        autoJoinStarted: false,
        channels,
        config: {
          autoJoinMeeting: false,
          autoJoinVoice: true,
          commandUrl: null,
          demoWorkspace: false,
          email: 'owner@opencord.local',
          meetingId: null,
          meetingTitle: null,
          password: 'correct horse battery staple',
          preferredVoiceChannelName: 'Voice Lounge',
          rememberDevice: true,
          runId: 'oc-10-007',
          serverUrl: 'http://localhost:8080',
        },
        screen: 'channels',
        sessionToken: 'session-token',
      }),
    ).toBe('voice-lounge')
  })

  it('parses e2e media commands from the simulator URL scheme', () => {
    expect(mobileE2ECommandFromUrl('opencord-e2e://media/mute')).toBe('mute')
    expect(mobileE2ECommandFromUrl('opencord-e2e://media/deaf?source=phase10')).toBe('deaf')
    expect(mobileE2ECommandFromUrl('opencord-e2e://media/leave#done')).toBe('leave')
    expect(mobileE2ECommandFromUrl('opencord://media/leave')).toBeNull()
    expect(mobileE2ECommandFromUrl('opencord-e2e://settings')).toBeNull()
  })

  it('normalizes e2e commands from the command endpoint', () => {
    expect(normalizeMobileE2ECommand('mute')).toBe('mute')
    expect(normalizeMobileE2ECommand('deaf')).toBe('deaf')
    expect(normalizeMobileE2ECommand('leave')).toBe('leave')
    expect(normalizeMobileE2ECommand('media/mute')).toBeNull()
    expect(normalizeMobileE2ECommand(undefined)).toBeNull()
  })

  it('derives a state endpoint beside the command endpoint', () => {
    expect(mobileE2EStateUrl('http://127.0.0.1:19007/command')).toBe(
      'http://127.0.0.1:19007/state',
    )
    expect(mobileE2EStateUrl(' http://10.0.2.2:19007/command?poll=1#top ')).toBe(
      'http://10.0.2.2:19007/state',
    )
    expect(mobileE2EStateUrl(null)).toBeNull()
    expect(mobileE2EStateUrl('not a url')).toBeNull()
  })
})
