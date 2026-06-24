export type NativeScreenShareStream = {
  id: string
  participantIdentity: string
  streamUrl: string
}

export type NativeScreenSharePublicationSource = {
  participantIdentity: string
  publications: NativeScreenSharePublication[]
}

export type NativeScreenShareSubscriptionPayload = {
  participant?: {
    identity?: string
  }
  participantIdentity?: string
  publication: NativeScreenSharePublication
  track?: NativeScreenShareMediaTrack
}

export type NativeScreenSharePublication = {
  isMuted?: boolean
  isSubscribed?: boolean
  kind?: string
  mediaStream?: NativeScreenShareMediaStream
  name?: string
  sid?: string
  trackSid?: string
  source?: unknown
  setSubscribed?: (enabled: boolean) => void
  track?: NativeScreenShareMediaTrack
  trackName?: string
  videoTrack?: NativeScreenShareMediaTrack
}

type NativeScreenShareMediaStream = {
  toURL?: () => string
}

type NativeScreenShareMediaTrack = {
  kind?: string
  mediaStream?: NativeScreenShareMediaStream
  name?: string
  sid?: string
  source?: unknown
}

const SCREEN_SHARE_SOURCE = 'screen_share'

export type NativeScreenShareParticipant = {
  identity?: string
  audioTrackPublications?: unknown
  getTrackPublication?: (source: string) => NativeScreenSharePublication | undefined
  videoTrackPublications?: unknown
  trackPublications?: unknown
}

export function nativeScreenShareStreamsFromPublications(
  participantPublications: NativeScreenSharePublicationSource[],
): NativeScreenShareStream[] {
  return participantPublications.flatMap(({ participantIdentity, publications }) =>
    publications.flatMap((publication, index) => {
      const streamUrl = publicationStreamUrl(publication)
      if (!isNativeScreenSharePublication(publication) || !streamUrl) {
        return []
      }

      return [
        {
          id:
            publication.trackSid ??
            publication.sid ??
            publication.videoTrack?.sid ??
            publication.track?.sid ??
            `${participantIdentity}:screen:${index}`,
          participantIdentity,
          streamUrl,
        },
      ]
    }),
  )
}

export function nativeScreenShareStreamsFromParticipants(
  participantsValue: unknown,
): NativeScreenShareStream[] {
  const participants = collectionValues<NativeScreenShareParticipant>(participantsValue)

  return nativeScreenShareStreamsFromPublications(
    participants.map((participant, index) => ({
      participantIdentity: participant.identity ?? `remote-${index}`,
      publications: participantPublicationValues(participant),
    })),
  )
}

export function nativeScreenShareStreamFromSubscription({
  participant,
  participantIdentity,
  publication,
  track,
}: NativeScreenShareSubscriptionPayload): NativeScreenShareStream | null {
  const publicationWithTrack = {
    ...publication,
    track: track ?? publication.track,
  }
  const streamUrl = publicationStreamUrl(publicationWithTrack)
  if (!isNativeScreenSharePublication(publicationWithTrack) || !streamUrl) {
    return null
  }

  const identity = participantIdentity ?? participant?.identity ?? 'remote'
  return {
    id:
      publication.trackSid ??
      publication.sid ??
      track?.sid ??
      publication.videoTrack?.sid ??
      publication.track?.sid ??
      `${identity}:screen:subscribed`,
    participantIdentity: identity,
    streamUrl,
  }
}

export function resubscribeMissingNativeScreenShares(
  room: { remoteParticipants?: unknown },
  attempts: Map<string, number>,
  options: { delayMs?: number; maxAttempts?: number } = {},
) {
  const delayMs = options.delayMs ?? 250
  const maxAttempts = options.maxAttempts ?? 3
  const queued: string[] = []

  collectionValues<NativeScreenShareParticipant>(room.remoteParticipants).forEach(
    (participant, participantIndex) => {
      const participantIdentity = participant.identity ?? `remote-${participantIndex}`
      participantPublicationValues(participant).forEach((publication, publicationIndex) => {
        if (!nativeScreenSharePublicationNeedsResubscribe(publication)) {
          return
        }

        const key = nativeScreenSharePublicationKey(
          participantIdentity,
          publication,
          publicationIndex,
        )
        const nextAttempt = (attempts.get(key) ?? 0) + 1
        if (nextAttempt > maxAttempts || typeof publication.setSubscribed !== 'function') {
          return
        }

        attempts.set(key, nextAttempt)
        queued.push(key)
        publication.setSubscribed(false)
        setTimeout(() => {
          publication.setSubscribed?.(true)
        }, delayMs * nextAttempt)
      })
    },
  )

  return queued
}

export function nativeScreenSharePublicationNeedsResubscribe(
  publication: NativeScreenSharePublication,
) {
  return (
    isNativeScreenSharePublication(publication) &&
    !nativeScreenSharePublicationHasRenderableTrack(publication)
  )
}

export function nativeScreenSharePublicationHasRenderableTrack(
  publication: NativeScreenSharePublication,
) {
  return Boolean(publicationStreamUrl(publication))
}

export function nativeScreenSharePublicationKey(
  participantIdentity: string,
  publication: NativeScreenSharePublication,
  index: number,
) {
  return `${participantIdentity}:${
    publication.trackSid ??
    publication.sid ??
    publication.videoTrack?.sid ??
    publication.track?.sid ??
    `screen:${index}`
  }`
}

export function participantPublicationValues(
  participant: NativeScreenShareParticipant,
): NativeScreenSharePublication[] {
  const publications = [
    participant.getTrackPublication?.(SCREEN_SHARE_SOURCE),
    ...collectionValues<NativeScreenSharePublication>(participant.trackPublications),
    ...collectionValues<NativeScreenSharePublication>(participant.audioTrackPublications),
    ...collectionValues<NativeScreenSharePublication>(participant.videoTrackPublications),
  ].filter((publication): publication is NativeScreenSharePublication => Boolean(publication))
  const seenObjects = new WeakSet<object>()
  const seenKeys = new Set<string>()

  return publications.filter((publication, index) => {
    if (publication && typeof publication === 'object') {
      if (seenObjects.has(publication)) {
        return false
      }
      seenObjects.add(publication)
    }

    const key =
      publication.trackSid ??
      publication.sid ??
      publication.videoTrack?.sid ??
      publication.track?.sid ??
      `${String(publication.source ?? publication.track?.source ?? publication.trackName ?? publication.name ?? 'publication')}:${index}`
    if (seenKeys.has(key)) {
      return false
    }
    seenKeys.add(key)
    return true
  })
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

function publicationStreamUrl(publication: NativeScreenSharePublication) {
  return (
    publication.track?.mediaStream?.toURL?.() ??
    publication.videoTrack?.mediaStream?.toURL?.() ??
    publication.mediaStream?.toURL?.()
  )
}

export function isNativeScreenSharePublication(publication: NativeScreenSharePublication) {
  return (
    isScreenShareSource(publication.source) ||
    isScreenShareSource(publication.track?.source) ||
    isScreenShareSource(publication.videoTrack?.source) ||
    isNamedScreenShareVideo(publication)
  )
}

function isScreenShareSource(source: unknown) {
  return normalizeToken(source) === SCREEN_SHARE_SOURCE
}

function isNamedScreenShareVideo(publication: NativeScreenSharePublication) {
  if (!isVideoPublication(publication)) {
    return false
  }

  const trackName = normalizeToken(publication.trackName ?? publication.name)
  return trackName === 'screen' || trackName === SCREEN_SHARE_SOURCE
}

function isVideoPublication(publication: NativeScreenSharePublication) {
  return [
    publication.kind,
    publication.track?.kind,
    publication.videoTrack?.kind,
    publication.videoTrack ? 'video' : undefined,
  ].some((kind) => normalizeToken(kind) === 'video')
}

function normalizeToken(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}
