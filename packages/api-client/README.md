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

The v1 hand-written SDK covers server health, well-known discovery,
`/api/version`, and `/api/capabilities`. Future generated OpenAPI clients can
live behind this package boundary without changing app imports.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client lint
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter @opencord/api-client build
```
