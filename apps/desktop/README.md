# OpenCord Desktop

Electron desktop shell for the OpenCord web renderer.

## Current Surface

- Loads `apps/web/dist/index.html` by default.
- Loads `OPENCORD_DESKTOP_RENDERER_URL` when running against a Vite dev server.
- Uses secure renderer defaults: `contextIsolation`, `sandbox`, `webSecurity`, and no Node integration.
- Exposes a narrow preload bridge as `window.openCordDesktop`.
- Provides `window.openCordDesktop.notifications.showMessage(...)` for validated native message notifications.
- Opens external navigation through the OS browser.

## Development

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter web build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter desktop build
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter desktop start
```

Run the launch smoke check:

```bash
fnm exec --using 26 npx --yes pnpm@11.8.0 --filter desktop exec electron dist/main.js --smoke
```
