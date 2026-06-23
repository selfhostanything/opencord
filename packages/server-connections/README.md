# Server Connections

Shared multi-server connection state for OpenCord web, desktop, and mobile clients.

## Current Surface

- Versioned connection persistence key.
- Default local server connection.
- Add/update connection by normalized base URL.
- Switch active connection.
- Remove connection while preserving a valid active server.
- Per-server cache namespace helpers.

The package stores only the client routing metadata needed to reconnect:
display name, normalized base URL, discovered version/capabilities, and last
connection timestamp. Auth token storage will be added later behind a secure
platform-specific boundary.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/server-connections test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/server-connections lint
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/server-connections build
```
