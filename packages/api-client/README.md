# API Client

Typed REST client boundary shared by web, desktop, and mobile clients.

## Current Surface

- `DEFAULT_OPENCORD_SERVER_URL`
- `normalizeOpenCordBaseUrl`
- `createOpenCordApiClient`
- `OpenCordApiClient`
- `OpenCordApiError`
- `ServerHealth`
- `ServerDiscovery`
- `AuthResult`
- `AuthUser`
- `OidcProvider`
- `CompleteOidcLoginRequest`
- `RegisterPushTokenRequest`
- `PushToken`
- `JoinVoiceChannelRequest`
- `VoiceParticipant`
- `MediaRoomToken`
- `VoiceJoin`
- `Meeting`
- `MeetingAttendee`
- `MeetingReminder`

The v1 hand-written SDK covers server health, well-known discovery,
`/api/version`, `/api/capabilities`, `GET /auth/oidc/providers`,
`POST /auth/oidc/callback`, `POST /push-tokens`, `GET /push-tokens`,
`POST /voice/channels/{channel_id}/join`, and `GET /join/{join_slug}`.
Future generated OpenAPI clients can live behind this package boundary without
changing app imports.

Authenticated calls accept a bearer session token through:

```ts
createOpenCordApiClient({ sessionToken: '...' })
```

OIDC login discovery is shared by web, desktop, and mobile clients:

```ts
const providers = await client.oidcProvidersForEmail('member@company.example')
const session = await client.completeOidcLogin(providerAssertion)
```

Voice join calls return the user voice participant state and the LiveKit media
join config:

```ts
const client = createOpenCordApiClient({ sessionToken: '...' })
const join = await client.joinVoiceChannel(channelId, {
  selfMute: false,
  selfDeaf: false,
})
```

Meeting join URLs resolve through the same authenticated client:

```ts
const meeting = await client.resolveMeetingJoinUrl(joinSlug)
```

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client lint
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client build
```
