import { ParticipantEvent, RoomEvent } from 'livekit-client'

type NativeMediaEventTarget = {
  off?: (event: string, listener: () => void) => unknown
  on?: (event: string, listener: () => void) => unknown
}

type NativeMediaRoom = NativeMediaEventTarget & {
  remoteParticipants?: unknown
}

const ROOM_REFRESH_EVENTS = [
  RoomEvent.Connected,
  RoomEvent.Reconnected,
  RoomEvent.ConnectionStateChanged,
  RoomEvent.TrackSubscribed,
  RoomEvent.TrackUnsubscribed,
  RoomEvent.TrackPublished,
  RoomEvent.TrackUnpublished,
  RoomEvent.TrackMuted,
  RoomEvent.TrackUnmuted,
  RoomEvent.TrackStreamStateChanged,
  RoomEvent.TrackSubscriptionStatusChanged,
  RoomEvent.TrackSubscriptionPermissionChanged,
  RoomEvent.LocalTrackPublished,
  RoomEvent.LocalTrackUnpublished,
  RoomEvent.ParticipantConnected,
  RoomEvent.ParticipantDisconnected,
  RoomEvent.ParticipantActive,
  RoomEvent.Disconnected,
].filter((event) => typeof event === 'string').map((event) => String(event))

const PARTICIPANT_REFRESH_EVENTS = [
  ParticipantEvent.TrackPublished,
  ParticipantEvent.TrackUnpublished,
  ParticipantEvent.TrackSubscribed,
  ParticipantEvent.TrackUnsubscribed,
  ParticipantEvent.TrackMuted,
  ParticipantEvent.TrackUnmuted,
  ParticipantEvent.LocalTrackPublished,
  ParticipantEvent.LocalTrackUnpublished,
  ParticipantEvent.ConnectionQualityChanged,
].filter((event) => typeof event === 'string').map((event) => String(event))

export function registerNativeMediaRefreshListeners(
  room: NativeMediaRoom,
  listener: () => void,
) {
  const seenParticipants = new WeakSet<object>()
  const cleanups: Array<() => void> = []
  let stopped = false

  const refresh = () => {
    if (stopped) {
      return
    }
    registerCurrentParticipants()
    listener()
    scheduleNativeMediaNotify(listener)
  }

  const registerCurrentParticipants = () => {
    collectionValues<NativeMediaEventTarget>(room.remoteParticipants).forEach((participant) => {
      if (!participant || typeof participant !== 'object' || seenParticipants.has(participant)) {
        return
      }
      seenParticipants.add(participant)
      PARTICIPANT_REFRESH_EVENTS.forEach((event) => {
        cleanups.push(listen(participant, event, refresh))
      })
    })
  }

  registerCurrentParticipants()
  ROOM_REFRESH_EVENTS.forEach((event) => {
    cleanups.push(listen(room, event, refresh))
  })

  return () => {
    stopped = true
    cleanups.splice(0).forEach((cleanup) => cleanup())
  }
}

export function startNativeMediaStatePoll(listener: () => void, intervalMs = 1_000) {
  const interval = setInterval(listener, intervalMs)
  return () => clearInterval(interval)
}

function scheduleNativeMediaNotify(listener: () => void) {
  setTimeout(listener, 0)
  setTimeout(listener, 250)
  setTimeout(listener, 1_000)
}

function listen(
  target: NativeMediaEventTarget,
  event: string,
  listener: () => void,
) {
  if (typeof target.on !== 'function') {
    return () => {}
  }
  target.on(event, listener)
  return () => {
    target.off?.(event, listener)
  }
}

function collectionValues<T>(value: unknown): T[] {
  if (value instanceof Map) {
    return Array.from(value.values()) as T[]
  }
  if (Array.isArray(value)) {
    return value as T[]
  }
  if (value && typeof value === 'object' && 'values' in value) {
    const values = (value as { values?: unknown }).values
    if (typeof values === 'function') {
      return Array.from(values.call(value) as Iterable<unknown>) as T[]
    }
  }

  return []
}
