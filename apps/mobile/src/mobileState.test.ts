import { describe, expect, it } from 'vitest'

import {
  activeMobileServerConnection,
  createInitialMobileState,
  mobileCanListenToVoice,
  mobileCanSpeakInVoice,
  mobileReducer,
  mobilePushTokenRequest,
  mobileVoiceParticipantsForChannel,
} from './mobileState'
import { mobileRuntime } from './runtime'

describe('mobile app state', () => {
  it('declares the plain React Native runtime without Expo', () => {
    expect(mobileRuntime).toEqual({
      appRegistryName: 'OpenCord',
      framework: 'react-native-cli',
      usesExpo: false,
    })
  })

  it('starts on the login screen with default OpenCord server data', () => {
    const state = createInitialMobileState()

    expect(state.screen).toBe('login')
    expect(state.serverUrl).toBe('http://localhost:8080')
    expect(state.channels.map((channel) => channel.name)).toContain('general')
  })

  it('logs in to a selected server and shows channels', () => {
    const state = mobileReducer(
      createInitialMobileState(),
      {
        type: 'login.submit',
        serverUrl: 'https://chat.example.com',
        email: 'user@example.com',
      },
    )

    expect(state.screen).toBe('channels')
    expect(state.serverUrl).toBe('https://chat.example.com')
    expect(state.account?.email).toBe('user@example.com')
  })

  it('selects a channel and opens chat', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const state = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'backend' })

    expect(state.screen).toBe('chat')
    expect(state.selectedChannelId).toBe('backend')
  })

  it('adds local messages to the selected channel', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inChannel = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const state = mobileReducer(inChannel, {
      type: 'message.send',
      content: 'Hello from mobile',
    })

    expect(state.messages.at(-1)).toMatchObject({
      channelId: 'general',
      authorName: 'You',
      content: 'Hello from mobile',
      embeds: [],
      own: true,
    })
  })

  it('receives realtime channel messages and marks unopened channels unread', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const state = mobileReducer(inGeneral, {
      type: 'realtime.message_created',
      envelope: {
        id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc96',
        type: 'message.created',
        organization_id: 'org-1',
        scope: { space_id: 'space-1', channel_id: 'backend' },
        occurred_at: '2026-06-23T02:00:00.000Z',
        data: {
          message: {
            id: 'msg-1',
            channel_id: 'backend',
            author_user_id: 'user-2',
            content: 'Backend deploy finished',
          },
        },
      },
    })

    expect(state.messages.at(-1)).toMatchObject({
      id: 'msg-1',
      channelId: 'backend',
      authorName: 'user-2',
      content: 'Backend deploy finished',
      own: false,
    })
    expect(state.channels.find((channel) => channel.id === 'backend')?.unread).toBe(true)
  })

  it('preserves rich embeds from realtime message payloads', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inBackend = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'backend' })
    const state = mobileReducer(inBackend, {
      type: 'realtime.message_created',
      envelope: {
        id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc96',
        type: 'message.created',
        organization_id: 'org-1',
        scope: { space_id: 'space-1', channel_id: 'backend' },
        occurred_at: '2026-06-23T02:00:00.000Z',
        data: {
          message: {
            id: 'msg-embed-1',
            channel_id: 'backend',
            author_display_name: 'Release Hook',
            content: 'Deploy preview ready',
            embeds: [
              {
                type: 'rich',
                title: 'Deploy preview ready',
                description: 'Webhook embed payloads now render in official clients.',
                color: 2644333,
                fields: [
                  { name: 'Environment', value: 'production', inline: true },
                  { name: 'Version', value: '2026.06.24', inline: true },
                ],
                footer: { text: 'Release Hook' },
              },
            ],
          },
        },
      },
    })

    expect(state.messages.at(-1)).toMatchObject({
      id: 'msg-embed-1',
      authorName: 'Release Hook',
      embeds: [
        {
          title: 'Deploy preview ready',
          description: 'Webhook embed payloads now render in official clients.',
          color: 2644333,
          fields: [
            { name: 'Environment', value: 'production', inline: true },
            { name: 'Version', value: '2026.06.24', inline: true },
          ],
          footer: { text: 'Release Hook' },
        },
      ],
    })
  })

  it('receives realtime messages in the open channel without unread noise', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inBackend = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'backend' })
    const state = mobileReducer(inBackend, {
      type: 'realtime.message_created',
      envelope: {
        id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc96',
        type: 'message.created',
        organization_id: 'org-1',
        scope: { space_id: 'space-1', channel_id: 'backend' },
        occurred_at: '2026-06-23T02:00:00.000Z',
        data: {
          message: {
            id: 'msg-2',
            channel_id: 'backend',
            author_user_id: 'user-2',
            content: 'Watching logs now',
          },
        },
      },
    })

    expect(state.messages.at(-1)?.content).toBe('Watching logs now')
    expect(state.channels.find((channel) => channel.id === 'backend')?.unread).toBe(false)
  })

  it('builds mobile push token registration payloads for the shared API client', () => {
    expect(
      mobilePushTokenRequest('ExponentPushToken[abcdefghijklmnopqrstuvwxyz123456]', 'ios', 'Ada iPhone'),
    ).toEqual({
      platform: 'ios',
      token: 'ExponentPushToken[abcdefghijklmnopqrstuvwxyz123456]',
      deviceName: 'Ada iPhone',
    })
  })

  it('tracks push token registration state without retaining the raw device token', () => {
    const state = mobileReducer(createInitialMobileState(), {
      type: 'push.registered',
      pushToken: {
        id: '01973f83-f22a-73ba-ae76-5a045c52fc96',
        userId: '01973f83-f22a-73ba-ae76-5a045c52fc97',
        platform: 'ios',
        tokenLastFour: '456]',
        deviceName: 'Ada iPhone',
        createdAt: '2026-06-23T02:00:00.000Z',
        updatedAt: '2026-06-23T02:00:00.000Z',
      },
    })

    expect(state.pushRegistration).toEqual({
      status: 'registered',
      platform: 'ios',
      tokenLastFour: '456]',
      deviceName: 'Ada iPhone',
    })
    expect(JSON.stringify(state.pushRegistration)).not.toContain(
      'ExponentPushToken[abcdefghijklmnopqrstuvwxyz123456]',
    )
  })

  it('tracks push registration failures for mobile UI retry states', () => {
    const state = mobileReducer(createInitialMobileState(), {
      type: 'push.failed',
      message: 'notification permission denied',
    })

    expect(state.pushRegistration).toEqual({
      status: 'failed',
      message: 'notification permission denied',
    })
  })

  it('adds, switches, and removes independent server connections on mobile', () => {
    const initial = createInitialMobileState()
    const withCompany = mobileReducer(initial, {
      type: 'server.add',
      baseUrl: 'https://chat.company.com',
      displayName: 'Company Chat',
      serverVersion: '0.1.0',
      capabilities: ['messages'],
      now: '2026-06-23T02:01:00.000Z',
    })
    const withCommunity = mobileReducer(withCompany, {
      type: 'server.add',
      baseUrl: 'https://cord.community.example',
      displayName: 'Community',
      now: '2026-06-23T02:02:00.000Z',
    })

    expect(withCommunity.serverConnections.connections.map((connection) => connection.displayName)).toEqual([
      'Local OpenCord',
      'Company Chat',
      'Community',
    ])
    expect(activeMobileServerConnection(withCommunity)?.displayName).toBe('Community')
    expect(withCommunity.serverUrl).toBe('https://cord.community.example')

    const company = withCommunity.serverConnections.connections.find(
      (connection) => connection.displayName === 'Company Chat',
    )
    expect(company).toBeDefined()

    const switched = mobileReducer(withCommunity, {
      type: 'server.switch',
      connectionId: company!.id,
    })
    expect(activeMobileServerConnection(switched)?.displayName).toBe('Company Chat')
    expect(switched.serverUrl).toBe('https://chat.company.com')

    const removed = mobileReducer(switched, {
      type: 'server.remove',
      connectionId: company!.id,
    })
    expect(removed.serverConnections.connections.map((connection) => connection.displayName)).toEqual([
      'Local OpenCord',
      'Community',
    ])
    expect(activeMobileServerConnection(removed)?.displayName).toBe('Local OpenCord')
    expect(removed.serverUrl).toBe('http://localhost:8080')
  })

  it('joins a mobile voice channel and tracks local listen/speak capability', () => {
    const state = mobileReducer(createInitialMobileState(), {
      type: 'voice.join',
      channelId: 'standup',
    })

    expect(state.voice.connectedChannelId).toBe('standup')
    expect(mobileVoiceParticipantsForChannel(state, 'standup').map((participant) => participant.name)).toContain(
      'You',
    )
    expect(mobileCanListenToVoice(state)).toBe(true)
    expect(mobileCanSpeakInVoice(state)).toBe(true)
  })

  it('mutes and deafens the local mobile voice participant', () => {
    const joined = mobileReducer(createInitialMobileState(), {
      type: 'voice.join',
      channelId: 'standup',
    })
    const muted = mobileReducer(joined, { type: 'voice.toggle_mute' })
    const deafened = mobileReducer(muted, { type: 'voice.toggle_deaf' })

    expect(muted.voice.selfMute).toBe(true)
    expect(mobileCanListenToVoice(muted)).toBe(true)
    expect(mobileCanSpeakInVoice(muted)).toBe(false)
    expect(deafened.voice.selfDeaf).toBe(true)
    expect(deafened.voice.selfMute).toBe(true)
    expect(mobileCanListenToVoice(deafened)).toBe(false)
    expect(mobileCanSpeakInVoice(deafened)).toBe(false)
  })

  it('leaves mobile voice and rejects non-voice channel joins', () => {
    const initial = createInitialMobileState()
    const rejected = mobileReducer(initial, {
      type: 'voice.join',
      channelId: 'general',
    })
    const joined = mobileReducer(initial, {
      type: 'voice.join',
      channelId: 'standup',
    })
    const left = mobileReducer(joined, { type: 'voice.leave' })

    expect(rejected.voice.connectedChannelId).toBeNull()
    expect(left.voice.connectedChannelId).toBeNull()
    expect(left.voice.selfMute).toBe(false)
    expect(left.voice.selfDeaf).toBe(false)
    expect(mobileVoiceParticipantsForChannel(left, 'standup').map((participant) => participant.name)).not.toContain(
      'You',
    )
  })
})
