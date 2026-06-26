# Contributing

## Project Overview

opencode-webhook-notifier is an OpenCode plugin that sends webhook notifications (Discord, ntfy, Gotify, Telegram, generic HTTP) on permission, completion, error, and other session events. It is written in TypeScript, tested with Vitest, and linted/formatted with Biome.

## Development Setup

```bash
git clone https://github.com/<owner>/opencode-webhook-notifier.git
cd opencode-webhook-notifier
npm install
npm test
```

Requires Node.js 18+.

## Code Style

Biome handles both linting and formatting. Before opening a PR:

```bash
npm run format   # auto-format
npm run lint     # check lint rules
```

Configuration lives in `biome.json` and `.editorconfig`. Do not reformat unrelated files.

## Testing

```bash
npm test               # run the full suite once
npm run test:watch     # watch mode for TDD
npm run test:coverage  # run with coverage report
```

Write tests for any new behavior. Place tests under `tests/` mirroring `src/` structure.

## Pull Request Process

1. Branch from `main`.
2. Keep commits focused — use [conventional commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. Ensure `npm run lint`, `npm run typecheck`, and `npm test` all pass locally.
4. Squash merge is the default — collapse WIP commits into one clean commit.
5. Include a clear PR description linking any related issues.

## Commit Style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add Telegram parse-mode auto-escaping
fix: handle empty webhook target list
docs: clarify retry config defaults
```
