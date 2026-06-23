# OpenCord iOS

This directory owns the future plain React Native iOS project.

Use React Native CLI commands from `apps/mobile`:

```bash
pnpm --filter mobile ios
```

Do not add Expo config or Expo runtime dependencies here. iOS-specific WebRTC,
push notification, keychain, CallKit, and universal-link work should live in
the native iOS project once generated.
