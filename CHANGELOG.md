# Changelog

## 2.1.0 — 2026-08

### Added

- **Interactive Telegram Permission Approval**: Permission notifications sent to Telegram now include interactive inline buttons (`Allow Once`, `Allow Always`, `Reject`), allowing remote approval or rejection directly from Telegram without switching back to the terminal.
- **Telegram Long-Polling Receiver**: Added background long-polling (`getUpdates`) for Telegram bots to handle callback queries, enforce chat ID authorization, call the OpenCode client REST API to resolve permissions, and update message text with review status.
- **Telegram Token-Bucket Rate Limiter**: Added sliding-window message pacing adhering to Telegram Bot API limits (1 msg/s per chat, 30 msg/s bot-wide) to avoid rate limit breaches.
- **Dynamic Retry Delay & 429 Backoff**: Extended retry utility to support dynamic delays derived from HTTP `Retry-After` headers and Telegram error `parameters.retry_after` fields.
- **Telegram Markdown Parsing Fallback**: Automatically falls back to plain-text delivery when Telegram returns 400 Bad Request due to entity parsing errors (`can't parse entities`).
- **File Logging Support**: Added support for `OPENCODE_WEBHOOK_NOTIFIER_LOG_FILE` environment variable to write structured logs to a designated file.

### Fixed

- **Permission Queueing & Granular Deduplication**: Enhanced permission deduplication to track pending permissions by unique ID and tool execution hash, preventing race conditions and ensuring consecutive permissions are queued cleanly.
- **Telegram 409 Conflict Backoff**: Poller gracefully handles HTTP 409 Conflict when multiple OpenCode processes poll the same bot token, backing off without spamming error logs.

### Tests

- Added comprehensive characterization and integration test suites covering Telegram interactive permissions, rate limiter pacing, dynamic retry predicates, and file logging (200 total passing tests).

## 2.0.1 — 2026-06

### Fixed

- **`command.minDuration` now functional**: `getElapsedSinceLastPrompt()` is wired into the `session.idle` handler, so `elapsedSeconds` is populated for `complete`/`subagent_complete` events. Previously the skip logic never fired because `elapsedSeconds` was always `undefined`.
- **HTTP request timeout enforced**: all transports (Discord, ntfy, Gotify, Telegram, generic) now pass an `AbortSignal.timeout()` to `fetch()`, derived from the existing `timeout` config field (seconds → milliseconds). Previously no transport had a request timeout; a hung endpoint could block indefinitely.
- **`webhook.events` cast removed**: the `as NotifierConfig["webhook"]["events"]` type assertion in the loader is replaced with `parseWebhookEvents()`, which validates each event override entry through `webhookEventOverridesSchema` and filters unknown event types. The `webhookConfigSchema.events` field is now `z.record(z.string(), z.unknown())` to allow per-entry validation rather than whole-record rejection.
- **Telegram circuit-breaker isolation**: `targetIdentity()` for telegram targets now includes a hash of `botToken`, so distinct bots targeting the same `chatId` get isolated retry/circuit-breaker state.
- **`pruneOlderThan` uses `cutoffMs` for sequence map**: `sessionIdleSequence` entries are now pruned by timestamp (via a new `sessionSequenceAt` map) instead of by timer presence, fixing a minor memory leak for dead sessions.
- **Session-scoped debounce**: the webhook debounce key now includes `sessionID` (`webhook-${eventType}-${sessionID}`), so concurrent sessions no longer coalesce into a single notification. Same-session rapid events still debounce.

### Changed

- `timeout` config field (default `5`) now controls HTTP request timeout for webhook sends, not "Linux notification timeout". Documented in README.
- Telegram `priority: 0` override now has an inline code comment documenting that it maps to silent delivery (`disable_notification: true`), which differs from ntfy (1–5) and Gotify (0–10) where 0 is a valid priority.

### Added

- 19 new tests covering HTTP timeout signal propagation, session-scoped debounce, `minDuration`/`elapsedSeconds` behavior, `parseWebhookEvents` validation, and `pruneOlderThan` timestamp-based pruning.

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
