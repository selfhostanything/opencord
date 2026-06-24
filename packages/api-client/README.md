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
- `RefreshSessionRequest`
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
- `CreateBotApplicationRequest`
- `BotApplication`
- `BotToken`
- `BotApplicationCreated`
- `BotApplicationDetail`
- `CreateIncomingWebhookRequest`
- `IncomingWebhook`
- `IncomingWebhookWithToken`
- generated OpenAPI `paths`, `components`, and `operations` types

The v1 hand-written SDK covers server health, well-known discovery,
`/api/version`, `/api/capabilities`, `GET /auth/oidc/providers`,
`POST /auth/oidc/callback`, `POST /auth/refresh`, `POST /push-tokens`, `GET /push-tokens`,
`POST /voice/channels/{channel_id}/join`, `GET /join/{join_slug}`, bot
application management, and incoming webhook management.
Generated OpenAPI types live behind this package boundary without changing app
imports.

Authenticated calls accept a bearer session token through:

```ts
createOpenCordApiClient({ sessionToken: '...' })
```

Persistent device sessions use server-issued refresh tokens. Store refresh
tokens only in the platform secure store, then rotate them through:

```ts
const refreshed = await client.refreshSession({ refreshToken })
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

Incoming webhook management keeps raw tokens shown once:

```ts
const created = await client.createIncomingWebhook(channelId, { name: 'Deploy Hook' })
const webhooks = await client.listIncomingWebhooks(channelId)
const rotated = await client.rotateIncomingWebhookToken(channelId, created.id)
await client.deleteIncomingWebhook(channelId, rotated.id)
```

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client lint
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client check:openapi
```

Generate the contract types from the sibling server checkout:

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client generate:openapi
```

Use `OPENAPI_SPEC_PATH=/path/to/openapi.yaml` when the server contract is not at
the default sibling repo path.
