# opencode-webhook-notifier

OpenCode plugin that sends webhook notifications (Discord, ntfy, Gotify, Telegram, generic JSON) on permission, completion, error, and other events.

## What it does

Sends webhook notifications when:

- **Permission requested** — AI asks for file/command access
- **Session completed** — session goes idle
- **Subagent completed** — spawned agent finishes
- **Error occurred** — session hit an error
- **Question asked** — AI asks the user a question
- **User cancelled** — session cancelled by user (ESC)
- **Plan mode exited** — plan ready for review

Supports **Discord**, **ntfy**, **Gotify**, **Telegram**, and **generic JSON** simultaneously. All webhook sends are fire-and-forget — failures retry with exponential backoff, and a circuit breaker isolates failing endpoints so one bad target never blocks the others.

## Quick Start

### 1. Build

```bash
cd opencode-webhook-notifier
npm install    # first time only
npm run build  # run after every source change
```

### 2. Install

Add to your `opencode.json` (or `~/.config/opencode/opencode.json`):

```json
{
  "plugin": ["./path/to/opencode-webhook-notifier"]
}
```

Use an absolute path or a path relative to your project root.

### 3. Configure

Create `~/.config/opencode/opencode-webhook-notifier.json`:

```json
{
  "webhook": {
    "enabled": true,
    "targets": [
      {
        "type": "discord",
        "url": "https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
      }
    ]
  }
}
```

Restart OpenCode.

## Configuration

Config file location: `~/.config/opencode/opencode-webhook-notifier.json` (or set `OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH`).

Copy `opencode-webhook-notifier.example.json` as a starting point.

### Top-level options

| Option | Type | Default | Description |
|---|---|---|---|
| `showProjectName` | `boolean` | `true` | Include project name in notification title |
| `showSessionTitle` | `boolean` | `false` | Include `{sessionTitle}` in messages |
| `suppressWhenFocused` | `boolean` | `true` | Skip notifications when terminal is focused |
| `enableOnDesktop` | `boolean` | `false` | Run on Desktop/Web clients (not just CLI) |
| `focusCacheMs` | `number` | `250` | How long focus-detection results are cached (per probe) |
| `timeout` | `number` | `5` | HTTP request timeout in seconds for webhook sends (0 disables) |

### Webhook configuration

```json
{
  "webhook": {
    "enabled": true,
    "targets": [
      {
        "type": "discord",
        "url": "https://discord.com/api/webhooks/ID/TOKEN",
        "username": "OpenCode Bot",
        "avatarUrl": "https://example.com/avatar.png",
        "headers": {},
        "basicAuth": { "username": "", "password": "" }
      },
      {
        "type": "ntfy",
        "url": "https://ntfy.sh/opencode-alerts"
      },
      {
        "type": "gotify",
        "url": "https://gotify.example.com/message",
        "token": "APP_TOKEN",
        "priority": 5
      }
    ],
    "events": {
      "error": {
        "message": "CRITICAL: {sessionTitle}",
        "priority": 5,
        "tags": ["urgent"],
        "color": 15548997,
        "gotifyPriority": 8
      }
    }
  }
}
```

The `webhook.events` object accepts per-event overrides. Only known event types (`permission`, `complete`, `subagent_complete`, `error`, `question`, `user_cancelled`, `plan_exit`) are kept; unknown keys are silently filtered. Each override is validated individually — an invalid entry (e.g. `priority` as a string) is dropped without affecting other overrides.

### Webhook target fields

| Field | Discord | ntfy | Gotify | Telegram | Generic | Description |
|---|---|---|---|---|---|---|
| `type` | `"discord"` | `"ntfy"` | `"gotify"` | `"telegram"` | `"generic"` | Webhook type |
| `url` | Webhook URL | `https://server/topic` | `https://server/message` | — | Endpoint URL | Endpoint URL |
| `botToken` | — | — | — | Bot token | — | Telegram bot token |
| `chatId` | — | — | — | Chat ID or `@channel` | — | Telegram chat or channel |
| `parseMode` | — | — | — | `MarkdownV2` / `HTML` / `Markdown` | — | Telegram parse mode (auto-escapes) |
| `disableNotification` | — | — | — | `boolean` | — | Send silently |
| `disableLinkPreview` | — | — | — | `boolean` | — | Skip auto-link previews |
| `messageThreadId` | — | — | — | `number` | — | Forum/group thread ID |
| `method` | — | — | — | — | `POST` (default), `PUT`, `PATCH` | HTTP method |
| `bodyTemplate` | — | — | — | — | `string` or `object` | Body template with `{{placeholders}}` |
| `bearer` | — | — | — | — | Token | `Authorization: Bearer …` |
| `username` | Override sender name | — | — | — | — | Display name |
| `avatarUrl` | Override avatar | — | — | — | — | Avatar image URL |
| `topic` | — | Topic name | — | — | — | ntfy topic (extracted from URL if omitted) |
| `priority` | — | 1–5 (optional) | 0–10 (optional) | — | — | Notification priority — only sent when configured |
| `tags` | — | `string[]` (optional) | — | — | — | ntfy tags — only sent when configured |
| `token` | — | — | App token | — | — | Gotify app token |
| `headers` | `Record<string,string>` | Extra headers | Extra headers | Extra headers | Extra headers | Custom HTTP headers |
| `basicAuth` | `{username, password}` | Basic auth | Basic auth | — | Basic auth | HTTP basic auth |
| `retry` | `{maxAttempts?, initialDelayMs?, maxDelayMs?}` | same | same | same | same | Per-target retry override |
| `circuitBreaker` | `{failureThreshold?, cooldownMs?}` | same | same | same | same | Per-target breaker override |

### Event configuration

```json
{
  "events": {
    "permission": { "webhook": true, "command": true },
    "complete": { "webhook": true, "command": true },
    "subagent_complete": { "webhook": false, "command": true },
    "error": { "webhook": true, "command": true },
    "question": { "webhook": true, "command": true },
    "user_cancelled": { "webhook": false, "command": true },
    "plan_exit": { "webhook": true, "command": true }
  }
}
```

`subagent_complete` and `user_cancelled` default to `webhook: false` (silent by default, matching the original plugin).

### Message templates

```json
{
  "messages": {
    "permission": "Session needs permission: {sessionTitle}",
    "complete": "Session has finished: {sessionTitle}",
    "subagent_complete": "Subagent task completed: {sessionTitle}",
    "error": "Session encountered an error: {sessionTitle}",
    "question": "Session has a question: {sessionTitle}",
    "user_cancelled": "Session was cancelled by user: {sessionTitle}",
    "plan_exit": "Plan ready for review: {sessionTitle}"
  }
}
```

Placeholders: `{sessionTitle}`, `{agentName}`, `{projectName}`, `{timestamp}`, `{turn}`.

### Custom commands

```json
{
  "command": {
    "enabled": true,
    "path": "/path/to/script.sh",
    "args": ["--event", "{event}", "--message", "{message}"],
    "minDuration": 0
  }
}
```

Token substitution: `{event}`, `{message}`, `{sessionTitle}`, `{agentName}`, `{projectName}`, `{timestamp}`, `{turn}`.

`minDuration` (seconds) skips the command for sessions that completed faster than the threshold — useful to avoid notification spam on sub-second turns. The elapsed time is measured from the last user message to session idle. Set to `0` (default) to always fire.

For shell-invoked commands, prefer the `OC_*` environment variables over `{token}` placeholders — `$OC_MESSAGE`, `$OC_EVENT`, etc. are set on the child process and are immune to shell-injection via crafted message content. The `{token}` substitution splices values directly into `command.path`/`args`, which is safe for direct binary execution (no `shell: true`) but risky if the command itself invokes a shell (e.g. `sh -c 'echo {message}'`).

## Discord Setup

1. Discord server → **Settings** → **Integrations** → **Webhooks** → **New Webhook**
2. Copy the **Webhook URL**
3. Set `"type": "discord"` and `"url"` in config

## ntfy Setup

1. Use `https://ntfy.sh` or self-host: `https://docs.ntfy.sh`
2. Pick a topic name (e.g. `opencode-alerts`)
3. Set `"url"` to `https://ntfy.sh/opencode-alerts`
4. Optional: set `priority` (1–5), `tags` (e.g. `["warning", "opencode"]`), `basicAuth`

All ntfy fields (`priority`, `tags`, `basicAuth`) are fully optional. A minimal config works with just `type` and `url`:

```json
{ "type": "ntfy", "url": "https://ntfy.sh/my-topic" }
```

## Gotify Setup

1. Install Gotify server: `https://gotify.net`
2. Create an **Application** in the Gotify UI
3. Copy the **app token**
4. Set `"url"` to `https://your-gotify-server/message`
5. Set `"token"` to the app token

## Telegram Setup

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the bot token
2. Get the chat ID: send a message to the bot, then visit `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Configure:

```json
{
  "type": "telegram",
  "botToken": "123456:ABCDEF",
  "chatId": "@your_channel",
  "parseMode": "MarkdownV2"
}
```

`parseMode` is optional. When set, the title and message are automatically escaped for that mode. Telegram caps text at 4096 characters; longer messages are truncated with an ellipsis. Telegram has no numeric priority scale — setting an event override `priority: 0` maps to silent delivery (`disable_notification: true`). This differs from ntfy (1–5) and Gotify (0–10), where `0` is a valid priority value.

## Generic Webhook Setup

For arbitrary HTTP endpoints (your own backend, Slack incoming webhooks, Pushover, etc.):

```json
{
  "type": "generic",
  "url": "https://example.com/webhooks/opencode",
  "method": "POST",
  "headers": { "X-Source": "opencode" },
  "bearer": "secret-token",
  "bodyTemplate": {
    "text": "[{{event}}] {{title}}: {{message}}",
    "context": {
      "project": "{{projectName}}",
      "session": "{{sessionTitle}}",
      "turn": "{{turn}}"
    }
  }
}
```

Without `bodyTemplate`, the default body is a flat JSON object: `{title, message, event, timestamp, turn, sessionTitle, agentName, projectName}`.

Inside `bodyTemplate`, `{{placeholders}}` are substituted in any string value (including nested objects and arrays). Available: `title`, `message`, `event`, `timestamp`, `turn`, `sessionTitle`, `agentName`, `projectName`.

## Reliability

Each webhook target gets:

- **Retry with exponential backoff** — default 3 attempts (500 ms → 1 s → 2 s, with jitter, capped at 30 s).
- **Circuit breaker** — after 5 consecutive failures, the target is skipped for 60 seconds, then probed once. A success closes the circuit; another failure re-opens it.
- **Independent isolation** — one failing target does not delay or fail any other target.
- **HTTP request timeout** — each `fetch()` call is capped by the `timeout` config field (default 5 seconds → 5000 ms). A hung endpoint aborts and retries rather than blocking forever.
- **Session-scoped debounce** — rapid events of the same type within the same session are coalesced into one webhook (1000 ms window). Different sessions are never coalesced — each gets its own notification.

Override retry/breaker per target via `retry` and `circuitBreaker` fields. Override the global HTTP timeout via `timeout`. Defaults are tuned for transient failures; override if your endpoint has tighter SLOs.

## Logging

Set `OPENCODE_WEBHOOK_NOTIFIER_LOG` to `debug`, `info`, `warn` (default), `error`, or `silent` to control structured stderr logging. Each line is a single JSON object with `ts`, `level`, `prefix`, `msg`, plus context fields.

To avoid polluting the OpenCode terminal interface while debugging, you can direct logs to a file using `OPENCODE_WEBHOOK_NOTIFIER_LOG_FILE`:

```bash
OPENCODE_WEBHOOK_NOTIFIER_LOG=debug OPENCODE_WEBHOOK_NOTIFIER_LOG_FILE=/tmp/opencode-notifier.log opencode
```

## Focus Detection

When `suppressWhenFocused` is `true`, notifications are skipped if the terminal is the active window. Full platform support:

- **macOS**: AppleScript detection with tmux/WezTerm pane awareness
- **Linux**: Hyprland, Sway, Niri, KDE (kdotool), X11 (xdotool), with tmux/WezTerm pane awareness
- **Windows**: PowerShell `GetForegroundWindow()`
- **Fail-open**: If detection fails, notifications always fire

## Troubleshooting

### No webhooks sent

1. Check `webhook.enabled` is `true`
2. Verify `webhook.targets` has at least one target with valid `type` and `url`
3. Check the event is enabled in `events` (e.g. `events.permission.webhook: true`)
4. Check `suppressWhenFocused` — move focus away from terminal to test
5. Look for `[webhook-notifier]` errors in OpenCode logs

### Webhook fails with 401/403

- **Discord**: Verify the webhook URL is correct and not revoked
- **ntfy**: Check topic permissions; add auth if needed
- **Gotify**: Verify the app token is valid

### Multiple targets, only some receive

Each target is independent. Check individual target URLs and auth. Errors are logged per-target.

### Clearing cache

If OpenCode doesn't pick up plugin changes:

```bash
# Linux/macOS
rm -rf ~/.cache/opencode/node_modules/opencode-webhook-notifier

# Windows
Remove-Item -Recurse -Force "$env:USERPROFILE\.cache\opencode\node_modules\opencode-webhook-notifier"
```

Then restart OpenCode.

## Security

### Reporting a Vulnerability

Report security issues via **GitHub Security Advisories** (private) or GitHub Issues if low-severity and non-exploitable. Do not open public issues for critical or exploitable bugs — use the private advisory flow so the fix can ship before disclosure.

- **Acknowledgement:** within 48 hours.
- **Critical fixes:** within 7 days of confirmation.
- **Other severities:** best-effort within 30 days.

### Supported Versions

Only the **latest release** receives security updates. Upgrade before reporting.

### Secrets Handling

This plugin reads webhook URLs, bot tokens (Telegram), and app tokens (Gotify) from a JSON config file at `~/.config/opencode/opencode-webhook-notifier.json` (or a path set via `OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH`).

- Treat the config file as a secret. Restrict file permissions (`chmod 600`).
- Do not commit config files containing live credentials to the repository.
- Webhook URLs and bot tokens are sent only to their respective providers over HTTPS; they are never logged above `debug` level and never written to disk.
- If a token may have leaked, rotate it at the provider immediately — do not wait for a plugin update.
