import { create } from 'zustand'
import {
  buildOpenCordRoutePath,
  type OpenCordRouteTarget,
  type OpenCordSettingsPanel,
} from '@opencord/client-contracts'

import type {
  MobileMediaPermissionRow,
  MobileMediaPermissionStatus,
} from './mobileState'

export type MobileAccountMetadata = {
  displayName: string
  email: string
}

export type MobilePendingAttachment = {
  id: string
  fileName: string
  contentType: string
  sizeBytes: number
  localUri: string
  attachmentId?: string
  downloadUrl?: string
  errorMessage?: string
  uploadProgress?: number
  uploadStatus?: 'ready' | 'uploading' | 'uploaded' | 'failed'
}

export type MobileMessageTarget = {
  channelId: string
  messageId: string
}

export type MobileSessionStore = {
  account: MobileAccountMetadata | null
  activeServerId: string | null
  selectedOrganizationId: string | null
  selectedSpaceId: string | null
  selectedChannelId: string | null
  routePath: string
  routeTarget: OpenCordRouteTarget | null
  clearSessionUi: () => void
  setAccountMetadata: (account: MobileAccountMetadata | null) => void
  setRouteTarget: (routeTarget: OpenCordRouteTarget) => void
}

export type MobileChatStore = {
  composerTextByChannelId: Record<string, string>
  editTarget: MobileMessageTarget | null
  messageActionSheetTarget: MobileMessageTarget | null
  pendingAttachmentsByChannelId: Record<string, MobilePendingAttachment[]>
  replyTarget: MobileMessageTarget | null
  unreadChannelIds: string[]
  beginEdit: (target: MobileMessageTarget) => void
  beginReply: (target: MobileMessageTarget) => void
  clearDraftTarget: () => void
  clearChannelUnread: (channelId: string) => void
  clearComposer: (channelId: string) => void
  markChannelUnread: (channelId: string) => void
  openMessageActions: (target: MobileMessageTarget | null) => void
  setComposerText: (channelId: string, text: string) => void
  setPendingAttachments: (channelId: string, attachments: MobilePendingAttachment[]) => void
}

export type MobileVoiceScreenShareWatcher =
  | { status: 'idle'; remoteScreenShares: 0 }
  | { status: 'watching'; remoteScreenShares: number }
  | { status: 'error'; remoteScreenShares: number; message: string }

export type MobileVoiceStore = {
  activeRoute: OpenCordRouteTarget | null
  connectionStatus: 'idle' | 'joining' | 'joined' | 'reconnecting' | 'error'
  deafened: boolean
  errorMessage: string | null
  muted: boolean
  screenShareWatcher: MobileVoiceScreenShareWatcher
  joinRoute: (routeTarget: OpenCordRouteTarget) => void
  leave: () => void
  setDeafened: (deafened: boolean) => void
  setError: (message: string) => void
  setMute: (muted: boolean) => void
  setScreenShareWatcher: (watcher: MobileVoiceScreenShareWatcher) => void
}

export type MobileSettingsStore = {
  activePanel: OpenCordSettingsPanel
  nativeCallIntegration: MobileMediaPermissionStatus
  notificationPermission: MobileMediaPermissionStatus
  permissionRows: MobileMediaPermissionRow[]
  openPanel: (panel: OpenCordSettingsPanel) => void
  setNativeCallIntegration: (status: MobileMediaPermissionStatus) => void
  setNotificationPermission: (status: MobileMediaPermissionStatus) => void
  setPermissionRows: (rows: MobileMediaPermissionRow[]) => void
}

const initialSessionData = {
  account: null,
  activeServerId: null,
  selectedOrganizationId: null,
  selectedSpaceId: null,
  selectedChannelId: null,
  routePath: '/',
  routeTarget: null,
} satisfies Omit<
  MobileSessionStore,
  'clearSessionUi' | 'setAccountMetadata' | 'setRouteTarget'
>

const initialChatData = {
  composerTextByChannelId: {},
  editTarget: null,
  messageActionSheetTarget: null,
  pendingAttachmentsByChannelId: {},
  replyTarget: null,
  unreadChannelIds: [],
} satisfies Omit<
  MobileChatStore,
  | 'beginEdit'
  | 'beginReply'
  | 'clearDraftTarget'
  | 'clearChannelUnread'
  | 'clearComposer'
  | 'markChannelUnread'
  | 'openMessageActions'
  | 'setComposerText'
  | 'setPendingAttachments'
>

const initialVoiceData = {
  activeRoute: null,
  connectionStatus: 'idle',
  deafened: false,
  errorMessage: null,
  muted: false,
  screenShareWatcher: { status: 'idle', remoteScreenShares: 0 },
} satisfies Omit<
  MobileVoiceStore,
  | 'joinRoute'
  | 'leave'
  | 'setDeafened'
  | 'setError'
  | 'setMute'
  | 'setScreenShareWatcher'
>

const initialSettingsData = {
  activePanel: 'account',
  nativeCallIntegration: 'promptable',
  notificationPermission: 'promptable',
  permissionRows: [],
} satisfies Omit<
  MobileSettingsStore,
  | 'openPanel'
  | 'setNativeCallIntegration'
  | 'setNotificationPermission'
  | 'setPermissionRows'
>

export const useMobileSessionStore = create<MobileSessionStore>((set) => ({
  ...initialSessionData,
  clearSessionUi: () => set(initialSessionData),
  setAccountMetadata: (account) => set({ account }),
  setRouteTarget: (routeTarget) =>
    set({
      activeServerId: serverIdFromRouteTarget(routeTarget),
      routePath: buildOpenCordRoutePath(routeTarget),
      routeTarget,
      selectedChannelId: channelIdFromRouteTarget(routeTarget),
      selectedOrganizationId: organizationIdFromRouteTarget(routeTarget),
      selectedSpaceId: spaceIdFromRouteTarget(routeTarget),
    }),
}))

export const useMobileChatStore = create<MobileChatStore>((set) => ({
  ...initialChatData,
  beginEdit: (editTarget) =>
    set({ editTarget, messageActionSheetTarget: null, replyTarget: null }),
  beginReply: (replyTarget) =>
    set({ editTarget: null, messageActionSheetTarget: null, replyTarget }),
  clearDraftTarget: () =>
    set({ editTarget: null, messageActionSheetTarget: null, replyTarget: null }),
  clearChannelUnread: (channelId) =>
    set((state) => ({
      unreadChannelIds: state.unreadChannelIds.filter((id) => id !== channelId),
    })),
  clearComposer: (channelId) =>
    set((state) => ({
      composerTextByChannelId: withoutRecordKey(state.composerTextByChannelId, channelId),
      pendingAttachmentsByChannelId: withoutRecordKey(
        state.pendingAttachmentsByChannelId,
        channelId,
      ),
    })),
  markChannelUnread: (channelId) =>
    set((state) => ({
      unreadChannelIds: state.unreadChannelIds.includes(channelId)
        ? state.unreadChannelIds
        : [...state.unreadChannelIds, channelId],
    })),
  openMessageActions: (messageActionSheetTarget) => set({ messageActionSheetTarget }),
  setComposerText: (channelId, text) =>
    set((state) => ({
      composerTextByChannelId: {
        ...state.composerTextByChannelId,
        [channelId]: text,
      },
    })),
  setPendingAttachments: (channelId, attachments) =>
    set((state) => ({
      pendingAttachmentsByChannelId: {
        ...state.pendingAttachmentsByChannelId,
        [channelId]: attachments,
      },
    })),
}))

export const useMobileVoiceStore = create<MobileVoiceStore>((set) => ({
  ...initialVoiceData,
  joinRoute: (activeRoute) =>
    set({
      activeRoute,
      connectionStatus: 'joining',
      errorMessage: null,
    }),
  leave: () => set(initialVoiceData),
  setDeafened: (deafened) => set({ deafened }),
  setError: (errorMessage) => set({ connectionStatus: 'error', errorMessage }),
  setMute: (muted) => set({ muted }),
  setScreenShareWatcher: (screenShareWatcher) => set({ screenShareWatcher }),
}))

export const useMobileSettingsStore = create<MobileSettingsStore>((set) => ({
  ...initialSettingsData,
  openPanel: (activePanel) => set({ activePanel }),
  setNativeCallIntegration: (nativeCallIntegration) => set({ nativeCallIntegration }),
  setNotificationPermission: (notificationPermission) => set({ notificationPermission }),
  setPermissionRows: (permissionRows) => set({ permissionRows }),
}))

export function resetMobileStoresForTest() {
  useMobileSessionStore.setState(initialSessionData)
  useMobileChatStore.setState(initialChatData)
  useMobileVoiceStore.setState(initialVoiceData)
  useMobileSettingsStore.setState(initialSettingsData)
}

function serverIdFromRouteTarget(routeTarget: OpenCordRouteTarget) {
  return 'serverId' in routeTarget ? routeTarget.serverId ?? null : null
}

function organizationIdFromRouteTarget(routeTarget: OpenCordRouteTarget) {
  return 'organizationId' in routeTarget ? routeTarget.organizationId ?? null : null
}

function spaceIdFromRouteTarget(routeTarget: OpenCordRouteTarget) {
  return 'spaceId' in routeTarget ? routeTarget.spaceId ?? null : null
}

function channelIdFromRouteTarget(routeTarget: OpenCordRouteTarget) {
  return 'channelId' in routeTarget ? routeTarget.channelId ?? null : null
}

function withoutRecordKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record }
  delete next[key]
  return next
}
