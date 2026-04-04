# opencode-webhook-notifier

OpenCode plugin that sends webhook notifications (Discord, ntfy, Gotify) on permission, completion, error, and other events.

## What it does

Sends webhook notifications when:

- **Permission requested** — AI asks for file/command access
- **Session completed** — session goes idle
- **Subagent completed** — spawned agent finishes
- **Error occurred** — session hit an error
- **Question asked** — AI asks the user a question
- **User cancelled** — session cancelled by user (ESC)
- **Plan mode exited** — plan ready for review

Supports **Discord**, **ntfy**, and **Gotify** simultaneously. All webhook sends are fire-and-forget — failures are logged but never crash the plugin.

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
| `timeout` | `number` | `5` | Linux notification timeout (kept for compat) |

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

### Webhook target fields

| Field | Discord | ntfy | Gotify | Description |
|---|---|---|---|---|
| `type` | `"discord"` | `"ntfy"` | `"gotify"` | Webhook type |
| `url` | Webhook URL | `https://server/topic` | `https://server/message` | Endpoint URL |
| `username` | Override sender name | — | — | Display name |
| `avatarUrl` | Override avatar | — | — | Avatar image URL |
| `topic` | — | Topic name | — | ntfy topic (extracted from URL if omitted) |
| `priority` | — | 1–5 (optional) | 0–10 (optional) | Notification priority — only sent when configured |
| `tags` | — | `string[]` (optional) | — | ntfy tags — only sent when configured |
| `token` | — | — | App token | Gotify app token |
| `headers` | `Record<string,string>` | Extra headers | Extra headers | Custom HTTP headers |
| `basicAuth` | `{username, password}` | Basic auth | Basic auth | HTTP basic auth |

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
