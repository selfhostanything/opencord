# Realtime Client

Typed WebSocket gateway client shared by web, desktop, and mobile clients.

## Current Surface

- `realtimeUrlForServer`
- `createOpenCordRealtimeClient`
- `OpenCordRealtimeClient`
- `RealtimeConnectionStatus`
- `RealtimeIncomingEnvelope`
- `RealtimeClientMessage`
- `INITIAL_REALTIME_STATUS`

The v1 client matches the server `/ws` contract:

- Auth token is passed as a `token` query parameter.
- Server events use `{ id, type, organization_id, scope, occurred_at, data }`.
- Client messages support `ping`, `typing.start`, and `typing.stop`.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/realtime test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/realtime lint
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/realtime build
```
