import { describe, expect, it, beforeEach } from 'vitest'

import type { OpenCordRouteTarget } from '@opencord/client-contracts'

import {
  resetMobileStoresForTest,
  useMobileChatStore,
  useMobileSessionStore,
  useMobileSettingsStore,
  useMobileVoiceStore,
} from './mobileStores'

describe('mobile Zustand stores', () => {
  beforeEach(() => {
    resetMobileStoresForTest()
  })

  it('stores non-secret session route state without retaining auth tokens', () => {
    const channelRoute: OpenCordRouteTarget = {
      kind: 'channel',
      serverId: 'local-opencord',
      organizationId: 'org-1',
      spaceId: 'space-1',
      channelId: 'general',
    }

    useMobileSessionStore.getState().setAccountMetadata({
      displayName: 'Ada',
      email: 'ada@example.com',
    })
    useMobileSessionStore.getState().setRouteTarget(channelRoute)

    expect(useMobileSessionStore.getState()).toMatchObject({
      account: {
        displayName: 'Ada',
        email: 'ada@example.com',
      },
      activeServerId: 'local-opencord',
      selectedOrganizationId: 'org-1',
      selectedSpaceId: 'space-1',
      selectedChannelId: 'general',
      routePath: '/servers/local-opencord/spaces/space-1/channels/general',
    })
    expect('sessionToken' in useMobileSessionStore.getState()).toBe(false)
  })

  it('tracks composer, reply/edit state, pending attachments, and unread markers', () => {
    useMobileChatStore.getState().setComposerText('general', 'Ship it')
    useMobileChatStore.getState().beginReply({ channelId: 'general', messageId: 'msg-1' })
    useMobileChatStore.getState().openMessageActions({ channelId: 'general', messageId: 'msg-1' })
    useMobileChatStore.getState().setPendingAttachments('general', [
      {
        id: 'local-file-1',
        fileName: 'diagram.png',
        contentType: 'image/png',
        uploadProgress: 0,
        uploadStatus: 'ready',
        sizeBytes: 1200,
        localUri: 'file:///tmp/diagram.png',
      },
    ])
    useMobileChatStore.getState().markChannelUnread('backend')

    expect(useMobileChatStore.getState()).toMatchObject({
      composerTextByChannelId: {
        general: 'Ship it',
      },
      replyTarget: {
        channelId: 'general',
        messageId: 'msg-1',
      },
      pendingAttachmentsByChannelId: {
        general: [
          {
            id: 'local-file-1',
            fileName: 'diagram.png',
            contentType: 'image/png',
            uploadProgress: 0,
            uploadStatus: 'ready',
            sizeBytes: 1200,
            localUri: 'file:///tmp/diagram.png',
          },
        ],
      },
      messageActionSheetTarget: {
        channelId: 'general',
        messageId: 'msg-1',
      },
      unreadChannelIds: ['backend'],
    })

    useMobileChatStore.getState().beginEdit({ channelId: 'general', messageId: 'msg-2' })
    expect(useMobileChatStore.getState().editTarget).toEqual({
      channelId: 'general',
      messageId: 'msg-2',
    })
    expect(useMobileChatStore.getState().replyTarget).toBeNull()

    useMobileChatStore.getState().clearDraftTarget()
    expect(useMobileChatStore.getState().editTarget).toBeNull()
    expect(useMobileChatStore.getState().replyTarget).toBeNull()
    expect(useMobileChatStore.getState().messageActionSheetTarget).toBeNull()
  })

  it('tracks voice route, mute/deafen controls, and screen-share watcher state', () => {
    useMobileVoiceStore.getState().joinRoute({
      kind: 'channel',
      serverId: 'local-opencord',
      spaceId: 'space-1',
      channelId: 'voice',
    })
    useMobileVoiceStore.getState().setMute(true)
    useMobileVoiceStore.getState().setDeafened(true)
    useMobileVoiceStore.getState().setScreenShareWatcher({
      status: 'watching',
      remoteScreenShares: 2,
    })

    expect(useMobileVoiceStore.getState()).toMatchObject({
      activeRoute: {
        kind: 'channel',
        serverId: 'local-opencord',
        spaceId: 'space-1',
        channelId: 'voice',
      },
      muted: true,
      deafened: true,
      screenShareWatcher: {
        status: 'watching',
        remoteScreenShares: 2,
      },
    })
  })

  it('keeps quiet settings route and permission purpose state', () => {
    useMobileSettingsStore.getState().openPanel('voice-video')
    useMobileSettingsStore.getState().setPermissionRows([
      {
        kind: 'microphone',
        label: 'Microphone',
        status: 'promptable',
        purpose: 'Used when you speak in voice channels or meetings.',
        canRequest: true,
      },
    ])
    useMobileSettingsStore.getState().setNotificationPermission('system-settings-required')
    useMobileSettingsStore.getState().setNativeCallIntegration('granted')

    expect(useMobileSettingsStore.getState()).toMatchObject({
      activePanel: 'voice-video',
      notificationPermission: 'system-settings-required',
      nativeCallIntegration: 'granted',
      permissionRows: [
        {
          kind: 'microphone',
          label: 'Microphone',
          status: 'promptable',
          purpose: 'Used when you speak in voice channels or meetings.',
          canRequest: true,
        },
      ],
    })
  })
})
