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
- `RegisterPushTokenRequest`
- `PushToken`
- `JoinVoiceChannelRequest`
- `VoiceParticipant`
- `MediaRoomToken`
- `VoiceJoin`

The v1 hand-written SDK covers server health, well-known discovery,
`/api/version`, `/api/capabilities`, `POST /push-tokens`, `GET /push-tokens`,
and `POST /voice/channels/{channel_id}/join`. Future generated OpenAPI clients
can live behind this package boundary without changing app imports.

Authenticated calls accept a bearer session token through:

```ts
createOpenCordApiClient({ sessionToken: '...' })
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

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client lint
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client build
```
