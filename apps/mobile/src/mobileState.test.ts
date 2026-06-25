import { describe, expect, it } from 'vitest'

import {
  activeMobileServerConnection,
  createInitialMobileState,
  DEFAULT_MOBILE_OPENCORD_SERVER_URL,
  mobileDefaultOpenCordServerUrlForPlatform,
  mobileCanJoinVoice,
  mobileCanListenToVoice,
  mobileCanSpeakInVoice,
  mobileChannelsFromApiChannels,
  mobileComposerState,
  mobileMentionTokens,
  mobileMessageActionSheetOptions,
  mobileMessageTimelineGroups,
  mobileMemberRows,
  mobileMediaPermissionRows,
  mobileReducer,
  mobileRouteTargetForMessage,
  mobileRouteTargetForChannel,
  mobileSearchViewModel,
  mobileWorkspaceNavigatorSections,
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
    expect(state.serverUrl).toBe(DEFAULT_MOBILE_OPENCORD_SERVER_URL)
    expect(activeMobileServerConnection(state)?.baseUrl).toBe(DEFAULT_MOBILE_OPENCORD_SERVER_URL)
    expect(state.channels.map((channel) => channel.name)).toContain('general')
  })

  it('can start with an iOS simulator local server default', () => {
    const state = createInitialMobileState({
      defaultServerUrl: mobileDefaultOpenCordServerUrlForPlatform('ios'),
    })

    expect(state.serverUrl).toBe('http://localhost:8080')
    expect(activeMobileServerConnection(state)?.baseUrl).toBe('http://localhost:8080')
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

  it('stores authenticated mobile sessions and server-loaded channels after API login', () => {
    const state = mobileReducer(createInitialMobileState(), {
      type: 'login.succeeded',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
      displayName: 'Ada',
      sessionToken: 'session-token',
      channels: [
        {
          id: '019ef679-303f-72f2-83bd-4501222533f2',
          kind: 'voice',
          name: 'Standup',
          topic: 'Voice channel',
          unread: false,
        },
      ],
    })

    expect(state.screen).toBe('channels')
    expect(state.serverUrl).toBe('https://chat.example.com')
    expect(state.account).toEqual({ email: 'user@example.com', displayName: 'Ada' })
    expect(state.sessionToken).toBe('session-token')
    expect(state.channels.map((channel) => channel.id)).toEqual([
      '019ef679-303f-72f2-83bd-4501222533f2',
    ])
    expect(state.selectedChannelId).toBe('019ef679-303f-72f2-83bd-4501222533f2')
  })

  it('logs out without leaking session or jumping away from the active server', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.succeeded',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
      displayName: 'Ada',
      sessionToken: 'session-token',
      channels: [],
    })
    const permissionReady = mobileReducer(loggedIn, {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
    const joined = mobileReducer(permissionReady, { type: 'voice.join', channelId: 'standup' })

    const state = mobileReducer(joined, { type: 'logout' })

    expect(state.screen).toBe('login')
    expect(state.serverUrl).toBe('https://chat.example.com')
    expect(activeMobileServerConnection(state)?.baseUrl).toBe('https://chat.example.com')
    expect(state.account).toBeNull()
    expect(state.sessionToken).toBeNull()
    expect(state.voice.connectedChannelId).toBeNull()
    expect(mobileVoiceParticipantsForChannel(state, 'standup').map((participant) => participant.name)).not.toContain(
      'You',
    )
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

  it('builds Discord-like mobile workspace navigation sections', () => {
    const state = createInitialMobileState()
    const sections = mobileWorkspaceNavigatorSections(state)

    expect(sections).toEqual([
      {
        id: 'main-text-channels',
        title: 'OpenCord HQ / Text channels',
        spaceId: 'main',
        channels: [
          expect.objectContaining({
            id: 'general',
            kind: 'text',
            mentionCount: 2,
            selected: true,
            unread: true,
            voiceOccupancy: 0,
          }),
          expect.objectContaining({
            id: 'backend',
            kind: 'text',
            mentionCount: 0,
            selected: false,
            unread: false,
            voiceOccupancy: 0,
          }),
          expect.objectContaining({
            id: 'announcements',
            kind: 'text',
            mentionCount: 0,
            selected: false,
            unread: false,
            voiceOccupancy: 0,
          }),
        ],
      },
      {
        id: 'main-voice-channels',
        title: 'OpenCord HQ / Voice channels',
        spaceId: 'main',
        channels: [
          expect.objectContaining({
            id: 'standup',
            kind: 'voice',
            mentionCount: 0,
            selected: false,
            unread: false,
            voiceOccupancy: 1,
          }),
          expect.objectContaining({
            id: 'office-hours',
            kind: 'voice',
            mentionCount: 0,
            selected: false,
            unread: false,
            voiceOccupancy: 1,
          }),
        ],
      },
    ])
  })

  it('creates shared route targets for mobile channel navigation', () => {
    const state = createInitialMobileState()

    expect(mobileRouteTargetForChannel(state, 'backend')).toEqual({
      kind: 'channel',
      serverId: 'local-opencord',
      organizationId: 'local',
      spaceId: 'main',
      channelId: 'backend',
    })
    expect(mobileRouteTargetForChannel(state, 'missing')).toBeNull()
  })

  it('creates shared route targets for mobile jump-to-message navigation', () => {
    const state = createInitialMobileState()

    expect(mobileRouteTargetForMessage(state, 'seed-2')).toEqual({
      kind: 'message',
      serverId: 'local-opencord',
      organizationId: 'local',
      spaceId: 'main',
      channelId: 'backend',
      messageId: 'seed-2',
    })
    expect(mobileRouteTargetForMessage(state, 'missing')).toBeNull()
  })

  it('builds mobile channel, message, and recent mention search models', () => {
    const state = createInitialMobileState()

    const channelSearch = mobileSearchViewModel(state, { query: 'back', scope: 'channels' })
    expect(channelSearch).toMatchObject({
      status: 'ready',
      totalResults: 1,
      channelResults: [
        expect.objectContaining({
          channelId: 'backend',
          channelName: 'backend',
        }),
      ],
    })

    const messageSearch = mobileSearchViewModel(state, { query: 'deploy', scope: 'messages' })
    expect(messageSearch.messageResults).toEqual([
      expect.objectContaining({
        authorName: 'Release Hook',
        channelName: 'general',
        messageId: 'seed-1',
      }),
    ])

    const recentMentions = mobileSearchViewModel(state, { scope: 'mentions' })
    expect(recentMentions).toMatchObject({
      status: 'ready',
      mentionResults: [
        expect.objectContaining({
          mentionLabel: '@OpenCord',
          messageId: 'seed-mention-1',
        }),
      ],
    })
  })

  it('models mobile search loading, empty, error, and denied states', () => {
    const state = createInitialMobileState()

    expect(mobileSearchViewModel(state).status).toBe('idle')
    expect(mobileSearchViewModel(state, { query: 'missing', scope: 'messages' })).toMatchObject({
      status: 'empty',
      message: 'No results found.',
    })
    expect(
      mobileSearchViewModel(state, {
        availability: { status: 'loading', message: 'Searching server index...' },
        query: 'deploy',
      }),
    ).toMatchObject({
      status: 'loading',
      message: 'Searching server index...',
      totalResults: 0,
    })
    expect(
      mobileSearchViewModel(state, {
        availability: { status: 'error', message: 'Search index unavailable.' },
        query: 'deploy',
      }),
    ).toMatchObject({
      status: 'error',
      message: 'Search index unavailable.',
    })
    expect(
      mobileSearchViewModel(state, {
        availability: { status: 'permission-denied', message: 'Search is disabled here.' },
        query: 'deploy',
      }),
    ).toMatchObject({
      status: 'permission-denied',
      message: 'Search is disabled here.',
    })
  })

  it('derives member drawer rows with presence and voice activity near chat', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })

    const rows = mobileMemberRows(inGeneral)

    expect(rows[0]).toMatchObject({
      id: 'self',
      displayName: 'user',
      presence: 'online',
      role: 'You',
      self: true,
    })
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Mira',
          presence: 'speaking',
          activity: 'Speaking in #standup',
          voiceChannelName: 'standup',
        }),
        expect.objectContaining({
          bot: true,
          displayName: 'OpenCord Bot',
          role: 'Bot',
        }),
      ]),
    )
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
      authorKind: 'user',
      attachments: [],
      components: [],
      content: 'Hello from mobile',
      embeds: [],
      own: true,
      deliveryStatus: 'sent',
    })
  })

  it('groups mobile chat messages by consecutive author for dense timelines', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const first = mobileReducer(inGeneral, {
      type: 'message.send',
      clientId: 'local-first',
      content: 'First mobile update',
      now: '09:20',
    })
    const second = mobileReducer(first, {
      type: 'message.send',
      clientId: 'local-second',
      content: 'Second mobile update',
      now: '09:21',
    })

    expect(mobileMessageTimelineGroups(second).at(-1)).toEqual({
      id: 'group-local-first',
      authorName: 'You',
      authorKind: 'user',
      own: true,
      messages: [
        expect.objectContaining({
          id: 'local-first',
          content: 'First mobile update',
        }),
        expect.objectContaining({
          id: 'local-second',
          content: 'Second mobile update',
        }),
      ],
    })
  })

  it('models composer disabled states for empty text and non-text channels', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const inVoice = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'standup' })

    expect(mobileComposerState(inGeneral, '   ')).toEqual({
      canSend: false,
      disabledReason: 'Write a message before sending.',
      mode: 'send',
      pendingAttachmentCount: 0,
      placeholder: 'Message #general',
    })
    expect(mobileComposerState(inGeneral, 'Ship mobile chat')).toEqual({
      canSend: true,
      disabledReason: null,
      mode: 'send',
      pendingAttachmentCount: 0,
      placeholder: 'Message #general',
    })
    expect(mobileComposerState(inGeneral, '   ', { pendingAttachmentCount: 1 })).toEqual({
      canSend: true,
      disabledReason: null,
      mode: 'send',
      pendingAttachmentCount: 1,
      placeholder: 'Message #general',
    })
    expect(
      mobileComposerState(inGeneral, 'Edit text', {
        editTargetMessageId: 'local-owned',
        pendingAttachmentCount: 1,
      }),
    ).toEqual({
      canSend: false,
      disabledReason: 'Save the edit before adding attachments.',
      mode: 'edit',
      pendingAttachmentCount: 1,
      placeholder: 'Edit message',
    })
    expect(mobileComposerState(inVoice, 'Hello voice')).toEqual({
      canSend: false,
      disabledReason: 'Text messages can be sent only in text channels.',
      mode: 'send',
      pendingAttachmentCount: 0,
      placeholder: 'Message #standup',
    })
  })

  it('adds uploaded attachments to local attachment-only messages', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const state = mobileReducer(inGeneral, {
      type: 'message.send',
      attachments: [
        {
          id: '01973f83-f22a-73ba-ae76-5a045c52fc95',
          fileName: 'diagram.png',
          contentType: 'image/png',
          sizeBytes: 3072,
          status: 'uploaded',
          downloadUrl:
            'https://chat.example.com/attachments/01973f83-f22a-73ba-ae76-5a045c52fc95/content',
        },
      ],
      content: '   ',
    })

    expect(state.messages.at(-1)).toMatchObject({
      authorKind: 'user',
      content: '',
      attachments: [
        {
          fileName: 'diagram.png',
          contentType: 'image/png',
          sizeBytes: 3072,
          status: 'uploaded',
        },
      ],
      own: true,
    })
  })

  it('supports mobile send retry, reply, edit, delete, pin, and react actions', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const failedSend = mobileReducer(inGeneral, {
      type: 'message.send',
      clientId: 'local-failed',
      content: 'Needs retry',
      deliveryStatus: 'failed',
      errorMessage: 'Network unavailable',
      now: '09:20',
      replyToMessageId: 'seed-1',
    })
    const retried = mobileReducer(failedSend, {
      type: 'message.retry',
      messageId: 'local-failed',
      now: '09:21',
    })
    const edited = mobileReducer(retried, {
      type: 'message.edit',
      messageId: 'local-failed',
      content: 'Retry succeeded',
      now: '09:22',
    })
    const pinned = mobileReducer(edited, {
      type: 'message.pin',
      messageId: 'local-failed',
      pinned: true,
    })
    const reacted = mobileReducer(pinned, {
      type: 'message.react',
      messageId: 'local-failed',
      emoji: '✅',
    })
    const deleted = mobileReducer(reacted, {
      type: 'message.delete',
      messageId: 'local-failed',
    })

    expect(failedSend.messages.at(-1)).toMatchObject({
      id: 'local-failed',
      deliveryStatus: 'failed',
      deliveryError: 'Network unavailable',
      replyToMessageId: 'seed-1',
    })
    expect(retried.messages.at(-1)).toMatchObject({
      deliveryStatus: 'sending',
      deliveryError: null,
      time: '09:21',
    })
    expect(edited.messages.at(-1)).toMatchObject({
      content: 'Retry succeeded',
      deliveryStatus: 'sent',
      edited: true,
      editedAt: '09:22',
    })
    expect(reacted.messages.at(-1)).toMatchObject({
      pinned: true,
      reactions: [{ emoji: '✅', count: 1, selfReacted: true }],
    })
    expect(deleted.messages.at(-1)).toMatchObject({
      content: '',
      attachments: [],
      components: [],
      deleted: true,
      deliveryStatus: 'sent',
    })
  })

  it('exposes long-press action sheet options based on ownership', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inGeneral = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'general' })
    const withOwnMessage = mobileReducer(inGeneral, {
      type: 'message.send',
      clientId: 'local-owned',
      content: 'Own mobile message',
    })

    expect(mobileMessageActionSheetOptions(withOwnMessage, 'local-owned').map((option) => option.id)).toEqual([
      'reply',
      'edit',
      'delete',
      'copy',
      'pin',
      'react',
    ])
    expect(mobileMessageActionSheetOptions(withOwnMessage, 'seed-1').map((option) => option.id)).toEqual([
      'reply',
      'copy',
      'pin',
      'react',
      'report',
    ])
  })

  it('extracts mention tokens for mobile composer insertion and rendering', () => {
    expect(mobileMentionTokens('Ship with @Mira and @backend-team today')).toEqual([
      { display: 'Mira', query: 'mira', start: 10, end: 15 },
      { display: 'backend-team', query: 'backend-team', start: 20, end: 33 },
    ])
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

  it('preserves rich attachments, embeds, webhook identity, and bot components from realtime payloads', () => {
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
            webhook_username: 'Release Hook',
            webhook_avatar_url: 'https://chat.example.com/hook.png',
            attachments: [
              {
                id: '01973f83-f22a-73ba-ae76-5a045c52fc95',
                file_name: 'local-alpha-readme.txt',
                content_type: 'text/plain',
                size_bytes: 87,
                status: 'linked',
                download_url:
                  'https://chat.example.com/attachments/01973f83-f22a-73ba-ae76-5a045c52fc95/content',
              },
            ],
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: 'deploy:ack',
                    label: 'Acknowledge',
                  },
                ],
              },
            ],
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
      authorKind: 'webhook',
      authorBadge: 'WEBHOOK',
      avatarUrl: 'https://chat.example.com/hook.png',
      attachments: [
        {
          fileName: 'local-alpha-readme.txt',
          contentType: 'text/plain',
          sizeBytes: 87,
          status: 'linked',
        },
      ],
      components: [
        {
          id: 'deploy:ack',
          label: 'Acknowledge',
          disabled: false,
        },
      ],
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

  it('marks component-only app messages as bot-like when the server has no author_kind yet', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.submit',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
    })
    const inBackend = mobileReducer(loggedIn, { type: 'channel.select', channelId: 'backend' })
    const state = mobileReducer(inBackend, {
      type: 'realtime.message_created',
      envelope: {
        id: 'evt_01973f83-f22a-73ba-ae76-5a045c52fc97',
        type: 'message.created',
        organization_id: 'org-1',
        scope: { space_id: 'space-1', channel_id: 'backend' },
        occurred_at: '2026-06-23T02:00:00.000Z',
        data: {
          message: {
            id: 'msg-bot-1',
            channel_id: 'backend',
            author_display_name: 'Deploy Bot',
            content: '',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    custom_id: 'deploy:retry',
                    disabled: true,
                    label: 'Retry deploy',
                  },
                ],
              },
            ],
          },
        },
      },
    })

    expect(state.messages.at(-1)).toMatchObject({
      id: 'msg-bot-1',
      authorKind: 'bot',
      authorBadge: 'BOT',
      authorName: 'Deploy Bot',
      components: [
        {
          id: 'deploy:retry',
          label: 'Retry deploy',
          disabled: true,
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
    expect(removed.serverUrl).toBe(DEFAULT_MOBILE_OPENCORD_SERVER_URL)
  })

  it('restores the Android emulator local server when the last server is removed', () => {
    const initial = createInitialMobileState()
    const activeConnection = activeMobileServerConnection(initial)

    expect(activeConnection).toBeDefined()

    const state = mobileReducer(initial, {
      type: 'server.remove',
      connectionId: activeConnection!.id,
    })

    expect(activeMobileServerConnection(state)?.baseUrl).toBe(DEFAULT_MOBILE_OPENCORD_SERVER_URL)
    expect(state.serverUrl).toBe(DEFAULT_MOBILE_OPENCORD_SERVER_URL)
  })

  it('joins a mobile voice channel and tracks local listen/speak capability', () => {
    const permissionReady = mobileReducer(createInitialMobileState(), {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
    const state = mobileReducer(permissionReady, {
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

  it('keeps media permissions in a quiet settings model with purpose text', () => {
    const rows = mobileMediaPermissionRows(createInitialMobileState())

    expect(rows).toEqual([
      {
        kind: 'microphone',
        label: 'Microphone',
        status: 'promptable',
        purpose: 'Used when you speak in voice channels or meetings.',
        canRequest: true,
      },
      {
        kind: 'camera',
        label: 'Camera',
        status: 'promptable',
        purpose: 'Used when you turn on video in meetings.',
        canRequest: true,
      },
      {
        kind: 'screenShare',
        label: 'Screen sharing',
        status: 'promptable',
        purpose: 'Requested only when you start sharing from an active voice or meeting room.',
        canRequest: false,
      },
      {
        kind: 'speaker',
        label: 'Speaker',
        status: 'unsupported',
        purpose: 'Used to play remote call audio through the selected output.',
        canRequest: false,
      },
      {
        kind: 'notifications',
        label: 'Notifications',
        status: 'promptable',
        purpose: 'Used for incoming call and meeting alerts.',
        canRequest: true,
      },
      {
        kind: 'nativeCallIntegration',
        label: 'Native call integration',
        status: 'promptable',
        purpose:
          'Used to keep OpenCord voice and meeting audio visible on the lock screen and in system call controls.',
        canRequest: true,
      },
    ])
  })

  it('blocks mobile voice join until microphone permission is granted', () => {
    const blocked = mobileReducer(createInitialMobileState(), {
      type: 'voice.join',
      channelId: 'standup',
    })

    expect(blocked.voice.connectedChannelId).toBeNull()
    expect(blocked.voice.connectionStatus).toBe('blocked')
    expect(blocked.voice.errorMessage).toBe('Microphone permission is required before joining voice.')
    expect(mobileCanJoinVoice(blocked)).toBe(false)

    const granted = mobileReducer(blocked, {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })

    expect(granted.voice.connectionStatus).toBe('idle')
    expect(granted.voice.errorMessage).toBeNull()
    expect(mobileCanJoinVoice(granted)).toBe(true)
  })

  it('tracks server-issued mobile media joins without storing participant tokens in state', () => {
    const permissionReady = mobileReducer(createInitialMobileState(), {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
    const connecting = mobileReducer(permissionReady, {
      type: 'voice.media_connecting',
      channelId: 'standup',
    })
    const connected = mobileReducer(connecting, {
      type: 'voice.media_connected',
      channelId: 'standup',
      media: {
        roomName: 'opencord_voice_019ef679316974e1aedd9365f9ff198d',
        participantIdentity: '019ef679-303f-72f2-83bd-4501222533f2',
        canPublishAudio: true,
        canSubscribe: true,
        remoteScreenShareStreams: [
          {
            id: 'TR_SCREEN_1',
            participantIdentity: 'browser-owner',
            streamUrl: 'react-tag-screen-1',
          },
        ],
      },
    })

    expect(connecting.voice.connectionStatus).toBe('connecting')
    expect(connected.voice.connectionStatus).toBe('connected')
    expect(connected.voice.media).toEqual({
      roomName: 'opencord_voice_019ef679316974e1aedd9365f9ff198d',
      participantIdentity: '019ef679-303f-72f2-83bd-4501222533f2',
      canPublishAudio: true,
      canPublishScreen: false,
      canSubscribe: true,
      remoteScreenShares: 1,
      remoteScreenShareStreams: [
        {
          id: 'TR_SCREEN_1',
          participantIdentity: 'browser-owner',
          streamUrl: 'react-tag-screen-1',
        },
      ],
    })
    expect(JSON.stringify(connected.voice)).not.toContain('participant_token')
    expect(JSON.stringify(connected.voice)).not.toContain('livekit.jwt')
  })

  it('applies realtime media permission revocations to active mobile voice', () => {
    const permissionReady = mobileReducer(createInitialMobileState(), {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
    const connecting = mobileReducer(permissionReady, {
      type: 'voice.media_connecting',
      channelId: 'standup',
    })
    const connected = mobileReducer(connecting, {
      type: 'voice.media_connected',
      channelId: 'standup',
      media: {
        roomName: 'opencord_voice_019ef679316974e1aedd9365f9ff198d',
        participantIdentity: '019ef679-303f-72f2-83bd-4501222533f2',
        canPublishAudio: true,
        canPublishScreen: true,
        canSubscribe: true,
      },
    })
    const muted = mobileReducer(connected, {
      type: 'realtime.media_permission_revoked',
      envelope: {
        id: 'evt_mobile_audio_revoke',
        type: 'media.permission_revoked',
        organization_id: '019ef679-3158-7830-81f5-4b02336e9fa1',
        scope: { space_id: 'space-1', channel_id: 'standup' },
        occurred_at: '2026-06-24T00:04:00.000Z',
        data: {
          channel_id: 'standup',
          target_kind: 'member',
          target_id: '019ef679-303f-72f2-83bd-4501222533f2',
          action: 'restrict_publish',
          grants: {
            can_publish_audio: false,
            can_publish_screen: true,
            can_subscribe: true,
          },
        },
      },
    })
    const screenStopped = mobileReducer(muted, {
      type: 'realtime.media_permission_revoked',
      envelope: {
        id: 'evt_mobile_screen_revoke',
        type: 'media.permission_revoked',
        organization_id: '019ef679-3158-7830-81f5-4b02336e9fa1',
        scope: { space_id: 'space-1', channel_id: 'standup' },
        occurred_at: '2026-06-24T00:05:00.000Z',
        data: {
          channel_id: 'standup',
          target_kind: 'member',
          target_id: '019ef679-303f-72f2-83bd-4501222533f2',
          action: 'restrict_publish',
          grants: {
            can_publish_audio: false,
            can_publish_screen: false,
            can_subscribe: true,
          },
        },
      },
    })
    const disconnected = mobileReducer(screenStopped, {
      type: 'realtime.media_permission_revoked',
      envelope: {
        id: 'evt_mobile_connect_revoke',
        type: 'media.permission_revoked',
        organization_id: '019ef679-3158-7830-81f5-4b02336e9fa1',
        scope: { space_id: 'space-1', channel_id: 'standup' },
        occurred_at: '2026-06-24T00:06:00.000Z',
        data: {
          channel_id: 'standup',
          target_kind: 'member',
          target_id: '019ef679-303f-72f2-83bd-4501222533f2',
          action: 'disconnect',
          grants: {
            can_publish_audio: false,
            can_publish_screen: false,
            can_subscribe: true,
          },
        },
      },
    })

    expect(muted.voice.selfMute).toBe(true)
    expect(muted.voice.media?.canPublishAudio).toBe(false)
    expect(mobileCanSpeakInVoice(muted)).toBe(false)
    expect(muted.voice.errorMessage).toBe('Voice permissions changed. Your microphone was muted.')
    expect(screenStopped.voice.media?.canPublishScreen).toBe(false)
    expect(screenStopped.voice.errorMessage).toBe(
      'Voice permissions changed. Screen sharing stopped.',
    )
    expect(disconnected.voice.connectedChannelId).toBeNull()
    expect(disconnected.voice.media).toBeNull()
    expect(disconnected.voice.errorMessage).toBe(
      'Voice access changed. You were removed from the channel.',
    )
  })

  it('tracks server-issued meeting media rooms without requiring a voice channel row', () => {
    const loggedIn = mobileReducer(createInitialMobileState(), {
      type: 'login.succeeded',
      serverUrl: 'https://chat.example.com',
      email: 'user@example.com',
      displayName: 'Ada',
      sessionToken: 'session-token',
      channels: [],
    })
    const permissionReady = mobileReducer(loggedIn, {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
    const connecting = mobileReducer(permissionReady, {
      type: 'voice.media_connecting',
      channelId: 'meeting-1',
      displayName: 'OpenCord Local Alpha Standup',
    })
    const connected = mobileReducer(connecting, {
      type: 'voice.media_connected',
      channelId: 'meeting-1',
      media: {
        displayName: 'OpenCord Local Alpha Standup',
        roomName: 'opencord_meeting_019ef67931877331a2bdaa8b5ade1e57',
        participantIdentity: 'user-1',
        canPublishAudio: true,
        canSubscribe: true,
      },
    })

    expect(connecting.voice.connectedChannelId).toBe('meeting-1')
    expect(connecting.voice.connectionStatus).toBe('connecting')
    expect(connected.voice.media?.displayName).toBe('OpenCord Local Alpha Standup')
    expect(connected.voice.media?.roomName).toBe(
      'opencord_meeting_019ef67931877331a2bdaa8b5ade1e57',
    )
    expect(connected.voice.participants).toContainEqual(
      expect.objectContaining({
        channelId: 'meeting-1',
        self: true,
      }),
    )
  })

  it('replaces mobile remote screen-share streams as native media updates arrive', () => {
    const permissionReady = mobileReducer(createInitialMobileState(), {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
    const connecting = mobileReducer(permissionReady, {
      type: 'voice.media_connecting',
      channelId: 'standup',
    })
    const connected = mobileReducer(connecting, {
      type: 'voice.media_connected',
      channelId: 'standup',
      media: {
        roomName: 'opencord_voice_019ef679316974e1aedd9365f9ff198d',
        participantIdentity: '019ef679-303f-72f2-83bd-4501222533f2',
        canPublishAudio: true,
        canSubscribe: true,
      },
    })
    const watching = mobileReducer(connected, {
      type: 'voice.remote_screen_shares_updated',
      streams: [
        {
          id: 'TR_SCREEN_2',
          participantIdentity: 'browser-owner',
          streamUrl: 'react-tag-screen-2',
        },
      ],
    })
    const stopped = mobileReducer(watching, {
      type: 'voice.remote_screen_shares_updated',
      streams: [],
    })

    expect(watching.voice.media?.remoteScreenShares).toBe(1)
    expect(watching.voice.media?.remoteScreenShareStreams).toEqual([
      {
        id: 'TR_SCREEN_2',
        participantIdentity: 'browser-owner',
        streamUrl: 'react-tag-screen-2',
      },
    ])
    expect(stopped.voice.media?.remoteScreenShares).toBe(0)
    expect(stopped.voice.media?.remoteScreenShareStreams).toEqual([])
  })

  it('maps API channels into the mobile channel model for real server voice IDs', () => {
    const channels = mobileChannelsFromApiChannels([
      {
        id: '019ef679-303f-72f2-83bd-4501222533f2',
        organizationId: '019ef679-303f-72f2-83bd-4501222533f0',
        spaceId: '019ef679-303f-72f2-83bd-4501222533f1',
        kind: 'voice',
        name: 'Standup',
        slug: 'standup',
        topic: null,
        position: 2,
        isPrivate: false,
        archivedAt: null,
        createdAt: '2026-06-24T00:00:00.000Z',
      },
    ])

    expect(channels).toEqual([
      {
        id: '019ef679-303f-72f2-83bd-4501222533f2',
        kind: 'voice',
        name: 'Standup',
        organizationId: '019ef679-303f-72f2-83bd-4501222533f0',
        spaceId: '019ef679-303f-72f2-83bd-4501222533f1',
        topic: 'Voice channel',
        unread: false,
      },
    ])
  })

  it('mutes and deafens the local mobile voice participant', () => {
    const permissionReady = mobileReducer(createInitialMobileState(), {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
    const joined = mobileReducer(permissionReady, {
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
    const initial = mobileReducer(createInitialMobileState(), {
      type: 'permission.updated',
      kind: 'microphone',
      status: 'granted',
    })
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
