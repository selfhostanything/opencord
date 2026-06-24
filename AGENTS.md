# AGENTS.md

Rules for agents working in `opencord`.

- Use Node.js 26 through `fnm` before running package commands.
- Use `pnpm` for installs, dependency updates, tests, and builds.
- Prefer package-manager and generator commands over direct manifest edits.
- Use readable version-number pins for package dependencies, runtimes, CI
  actions, and container images. Do not pin them by commit SHA, image digest, or
  other hash-style references unless a human explicitly approves a narrow
  exception.
- Use TDD for behavior changes.
- Prefer larger coherent checkpoints over tiny commits. Keep test-first
  red/green iterations local, batch related UI/API/client behavior, run local
  validation first, then commit and push once for the batch.
- Do not use CI as the inner development loop. Push after local tests, lint,
  build, and browser/mobile validation have already passed or after documenting
  a real local blocker.
- Do not mute the Mac host output during media tests unless the user explicitly
  asks for silent execution. Browser-level or app-scoped audio muting is allowed
  when it does not change the host output mute state. This supersedes older
  Phase 10 prompts or goal notes that required host output muting.
- Keep the official clients Apache-2.0 licensed.
- The official web client must be able to connect to any compatible OpenCord server URL.
- Do not implement Phase 01 chat, media, meeting, or bot features in Phase 00.

Before Node commands:

```bash
fnm use 26
node --version
pnpm --version
```
