# OpenCord Android

This directory owns the future plain React Native Android project.

Use React Native CLI commands from `apps/mobile`:

```bash
pnpm --filter mobile android
```

Do not add Expo config or Expo runtime dependencies here. Android-specific
WebRTC, push notification, secure storage, and deep-link work should live in
the native Android project once generated.
