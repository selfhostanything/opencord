# OpenCord Mobile

Plain React Native mobile shell for OpenCord.

## Current Surface

- Login screen for selecting any compatible OpenCord server URL.
- Channel list screen.
- Chat screen with local message send state.
- Multi-server add/switch/remove state shared with web and desktop.
- Realtime `message.created` envelope reducer for received messages and unread channel state.
- Push token registration request helper and masked registration state.
- Shared `@opencord/api-client` default server URL normalization.
- Shared `@opencord/realtime` status type foundation.
- Shared `@opencord/server-connections` connection state foundation.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile start
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile test
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile ios
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter mobile android
```

## Native Project Ownership

The mobile package uses React Native CLI directly, not Expo. Native iOS and
Android project ownership lives under `ios/` and `android/` so future WebRTC,
push, secure storage, media permissions, and app-store build work can use the
native platform projects directly.
