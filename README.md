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

- `apps/web`: React/Vite web client shell.
- `apps/desktop`: Electron shell placeholder for Phase 02.
- `apps/mobile`: React Native/Expo shell placeholder for Phase 02.

## Packages

- `packages/api-client`: REST API client, push token methods, and generated SDK boundary.
- `packages/realtime`: realtime gateway client boundary.
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

The web shell defaults to `http://localhost:8080` and can connect to another compatible OpenCord server by changing the server URL field.
