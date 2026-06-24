import { create } from 'zustand'
import type { AuditEvent, BotApplicationDetail, IncomingWebhook, Meeting } from '@opencord/api-client'
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

export type MobileMeetingForm = {
  mode: 'create' | 'edit'
  title: string
  startsAt: string
  endsAt: string
  reminderOffsetMinutes: number
  reminderChannel: 'in_app' | 'email'
  organizationId?: string
  spaceId?: string | null
  channelId?: string | null
  meetingId?: string
}

export type MobileMeetingLocalReminder = {
  channel: 'in_app' | 'email'
  offsetMinutes: number
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

export type MobileMeetingsStore = {
  form: MobileMeetingForm | null
  localRemindersByMeetingId: Record<string, MobileMeetingLocalReminder>
  meetings: Meeting[]
  selectedMeetingId: string | null
  closeForm: () => void
  openCreateForm: (options: {
    channelId?: string | null
    defaultEndsAt: string
    defaultStartsAt: string
    organizationId?: string
    spaceId?: string | null
  }) => void
  openEditForm: (meeting: Meeting) => void
  selectMeeting: (meetingId: string | null) => void
  setFormField: <Key extends keyof MobileMeetingForm>(
    key: Key,
    value: MobileMeetingForm[Key],
  ) => void
  setLocalReminder: (meetingId: string, reminder: MobileMeetingLocalReminder) => void
  setMeetings: (meetings: Meeting[]) => void
  upsertMeeting: (meeting: Meeting) => void
}

export type MobileDeveloperStore = {
  auditEventsBySpaceId: Record<string, AuditEvent[]>
  botApplications: BotApplicationDetail[]
  webhooksByChannelId: Record<string, IncomingWebhook[]>
  removeIncomingWebhook: (channelId: string, webhookId: string) => void
  setAuditEvents: (spaceId: string, auditEvents: AuditEvent[]) => void
  setBotApplications: (botApplications: BotApplicationDetail[]) => void
  setIncomingWebhooks: (channelId: string, webhooks: IncomingWebhook[]) => void
  upsertBotApplication: (botApplication: BotApplicationDetail) => void
  upsertIncomingWebhook: (channelId: string, webhook: IncomingWebhook) => void
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

const initialMeetingsData = {
  form: null,
  localRemindersByMeetingId: {},
  meetings: [],
  selectedMeetingId: null,
} satisfies Omit<
  MobileMeetingsStore,
  | 'closeForm'
  | 'openCreateForm'
  | 'openEditForm'
  | 'selectMeeting'
  | 'setFormField'
  | 'setLocalReminder'
  | 'setMeetings'
  | 'upsertMeeting'
>

const initialDeveloperData = {
  auditEventsBySpaceId: {},
  botApplications: [],
  webhooksByChannelId: {},
} satisfies Omit<
  MobileDeveloperStore,
  | 'removeIncomingWebhook'
  | 'setAuditEvents'
  | 'setBotApplications'
  | 'setIncomingWebhooks'
  | 'upsertBotApplication'
  | 'upsertIncomingWebhook'
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

export const useMobileMeetingsStore = create<MobileMeetingsStore>((set) => ({
  ...initialMeetingsData,
  closeForm: () => set({ form: null }),
  openCreateForm: ({ channelId, defaultEndsAt, defaultStartsAt, organizationId, spaceId }) =>
    set({
      form: {
        channelId,
        endsAt: defaultEndsAt,
        mode: 'create',
        organizationId,
        reminderChannel: 'in_app',
        reminderOffsetMinutes: 10,
        spaceId,
        startsAt: defaultStartsAt,
        title: '',
      },
    }),
  openEditForm: (meeting) =>
    set({
      form: {
        channelId: meeting.channelId,
        endsAt: isoToLocalDateTimeInput(meeting.endsAt),
        meetingId: meeting.id,
        mode: 'edit',
        organizationId: meeting.organizationId,
        reminderChannel: meeting.reminders[0]?.channel === 'email' ? 'email' : 'in_app',
        reminderOffsetMinutes: meeting.reminders[0]?.offsetMinutes ?? 10,
        spaceId: meeting.spaceId,
        startsAt: isoToLocalDateTimeInput(meeting.startsAt),
        title: meeting.title,
      },
      selectedMeetingId: meeting.id,
    }),
  selectMeeting: (selectedMeetingId) => set({ selectedMeetingId }),
  setFormField: (key, value) =>
    set((state) => ({
      form: state.form ? { ...state.form, [key]: value } : state.form,
    })),
  setLocalReminder: (meetingId, reminder) =>
    set((state) => ({
      localRemindersByMeetingId: {
        ...state.localRemindersByMeetingId,
        [meetingId]: reminder,
      },
    })),
  setMeetings: (meetings) => set({ meetings: sortMeetings(meetings) }),
  upsertMeeting: (meeting) =>
    set((state) => ({
      meetings: sortMeetings([
        ...state.meetings.filter((candidate) => candidate.id !== meeting.id),
        meeting,
      ]),
      selectedMeetingId:
        state.selectedMeetingId && state.selectedMeetingId !== meeting.id
          ? state.selectedMeetingId
          : meeting.id,
    })),
}))

export const useMobileDeveloperStore = create<MobileDeveloperStore>((set) => ({
  ...initialDeveloperData,
  removeIncomingWebhook: (channelId, webhookId) =>
    set((state) => ({
      webhooksByChannelId: {
        ...state.webhooksByChannelId,
        [channelId]: (state.webhooksByChannelId[channelId] ?? []).filter(
          (webhook) => webhook.id !== webhookId,
        ),
      },
    })),
  setAuditEvents: (spaceId, auditEvents) =>
    set((state) => ({
      auditEventsBySpaceId: {
        ...state.auditEventsBySpaceId,
        [spaceId]: auditEvents,
      },
    })),
  setBotApplications: (botApplications) => set({ botApplications }),
  setIncomingWebhooks: (channelId, webhooks) =>
    set((state) => ({
      webhooksByChannelId: {
        ...state.webhooksByChannelId,
        [channelId]: webhooks,
      },
    })),
  upsertBotApplication: (botApplication) =>
    set((state) => ({
      botApplications: [
        ...state.botApplications.filter(
          (candidate) =>
            candidate.botApplication.id !== botApplication.botApplication.id,
        ),
        botApplication,
      ].sort((left, right) =>
        left.botApplication.name.localeCompare(right.botApplication.name),
      ),
    })),
  upsertIncomingWebhook: (channelId, webhook) =>
    set((state) => ({
      webhooksByChannelId: {
        ...state.webhooksByChannelId,
        [channelId]: [
          ...(state.webhooksByChannelId[channelId] ?? []).filter(
            (candidate) => candidate.id !== webhook.id,
          ),
          webhook,
        ].sort((left, right) => left.name.localeCompare(right.name)),
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

export function clearMobileRuntimeStores() {
  useMobileSessionStore.setState(initialSessionData)
  useMobileChatStore.setState(initialChatData)
  useMobileMeetingsStore.setState(initialMeetingsData)
  useMobileDeveloperStore.setState(initialDeveloperData)
  useMobileVoiceStore.setState(initialVoiceData)
  useMobileSettingsStore.setState(initialSettingsData)
}

export function resetMobileStoresForTest() {
  clearMobileRuntimeStores()
}

function sortMeetings(meetings: Meeting[]) {
  return [...meetings].sort((left, right) => {
    const statusRank = meetingStatusRank(left.status) - meetingStatusRank(right.status)
    if (statusRank !== 0) {
      return statusRank
    }

    return left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id)
  })
}

function meetingStatusRank(status: string) {
  return status === 'scheduled' ? 0 : 1
}

function isoToLocalDateTimeInput(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
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
