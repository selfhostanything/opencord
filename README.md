# OpenCord Clients

OpenCord official web, desktop, mobile, and shared TypeScript client packages.

## License

Apache-2.0.

## Runtime

Use Node.js 26 with `fnm`.

```bash
fnm use 26
corepack enable
pnpm install
```

## Apps

- `apps/web`: React/Vite web client shell with multi-server switching, chat UI, voice controls, and screen share controls.
- `apps/desktop`: Electron shell placeholder for Phase 02.
- `apps/mobile`: React Native/Expo shell with mobile chat, voice, and connection state.

## Packages

- `packages/api-client`: REST API client, push token methods, voice join method, meeting join URL resolver, and generated SDK boundary.
- `packages/realtime`: realtime gateway client boundary.
- `packages/server-connections`: shared multi-server connection manager and persistence helpers.
- `packages/media`: media integration client boundary.
- `packages/types`: shared TypeScript types.
- `packages/validation`: shared validation schemas.
- `packages/permissions`: shared permission helpers.
- `packages/ui-tokens`: shared design tokens.

## Development

```bash
pnpm install
pnpm --filter web dev
pnpm --filter web test
pnpm --filter web build
```

The web shell defaults to `http://localhost:8080` and can add, switch, remove,
and persist multiple compatible OpenCord server connections.
