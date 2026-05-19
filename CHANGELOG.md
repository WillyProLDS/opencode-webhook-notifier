# Changelog

## 2.0.0 — 2026-05

Major refactor and feature release. Core behavior is preserved end-to-end; configs from 1.x continue to work without changes.

### Added

- **New transports**: Telegram (with MarkdownV2/HTML/Markdown auto-escaping, 4096-char truncation, message threads, link-preview control) and generic JSON (custom method, `bodyTemplate` with `{{placeholders}}`, bearer/basic auth, custom headers).
- **Reliability layer**: per-target retry with exponential backoff and jitter (default 3 attempts, capped at 30s), per-target circuit breaker (default 5 failures → 60s cooldown, half-open probe). Both override-able per target.
- **Structured logging**: stderr JSON gated by `OPENCODE_WEBHOOK_NOTIFIER_LOG` (`debug`/`info`/`warn`/`error`/`silent`, default `warn`).
- **Config caching**: `loadConfig()` is now read once per ~30 s with mtime invalidation, eliminating per-event disk reads.
- **Focus-detection caching**: cached for `focusCacheMs` (default 250 ms) per probe, configurable.
- **Tooling**: vitest, biome, tsx, coverage v8. 148+ characterization tests covering config, interpolation, transports, retry, circuit breaker, queue, focus helpers, session state, and permission dedupe.

### Changed

- **Architectural refactor**: split monolithic `index.ts` (450+ LOC), `config.ts`, `webhook.ts`, `focus.ts` into focused modules under `src/{config,plugin,transport,focus,command,util,log}/`. Each module has a single responsibility and explicit dependencies.
- **Strict typing**: removed all `as any`, `@ts-ignore`, `@ts-expect-error`. Plugin events now use the SDK's discriminated union type.
- **Turn counter**: now in-memory (session-scoped). The 1.x JSON state file (`opencode-webhook-notifier-state.json`) is no longer written or read; it can be safely deleted.
- **`permission.asked` event**: the router now listens for both the v1 SDK's `permission.updated` and the legacy/v2 `permission.asked` event types. This makes the plugin forward-compatible while preserving the original behavior.
- **Focus baseline window ID**: now resolved lazily on first `isTerminalFocused()` call instead of at module import time, so plugin reloads and OS state changes are picked up correctly.

### Removed

- Disk-based turn-counter persistence (replaced with in-memory counter).
- All `console.*` calls (replaced with structured logger).

### Migration

- Existing configs work unchanged. New transport types (`telegram`, `generic`) and new fields (`retry`, `circuitBreaker`, `focusCacheMs`) are additive.
- The legacy state file at `~/.config/opencode/opencode-webhook-notifier-state.json` is no longer used and can be deleted.

## 1.0.1

- Initial open-source release with Discord, ntfy, Gotify support.
