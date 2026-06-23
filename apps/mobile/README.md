# OpenCord Mobile

React Native/Expo mobile shell for OpenCord.

## Current Surface

- Login screen for selecting any compatible OpenCord server URL.
- Channel list screen.
- Chat screen with local message send state.
- Realtime `message.created` envelope reducer for received messages and unread channel state.
- Push token registration request helper and masked registration state.
- Shared `@opencord/api-client` default server URL normalization.
- Shared `@opencord/realtime` status type foundation.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile start
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile build
```

Validate Expo config:

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile exec expo config --json
```
