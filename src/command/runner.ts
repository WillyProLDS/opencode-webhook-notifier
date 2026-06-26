import { spawn } from "node:child_process";
import type { EventType, NotifierConfig } from "../config/schema.js";
import type { Logger } from "../log/logger.js";
import { noopLogger } from "../log/logger.js";

export interface CommandTokenContext {
  event: EventType;
  message: string;
  sessionTitle?: string | null;
  agentName?: string | null;
  projectName?: string | null;
  timestamp?: string | null;
  turn?: number | null;
}

/**
 * Substitute `{token}` placeholders with context values.
 *
 * SECURITY NOTE:
 *   Token substitution into `command.path` / `command.args` is a convenience
 *   feature.  Because `spawn()` is called WITHOUT `shell: true`, the command
 *   binary is exec'd directly — shell metacharacters inside substituted values
 *   are NOT interpreted by a shell and are therefore safe in the default case.
 *
 *   HOWEVER, if a user configures `command.path` as a shell invocation
 *   (e.g. `sh -c 'echo {message}'`) the `{message}` value is spliced into the
 *   shell command string BEFORE the shell parses it, enabling command
 *   injection via crafted messages.
 *
 *   To avoid this, users should reference the `OC_*` environment variables
 *   (set below) instead of `{token}` placeholders inside shell-invoked
 *   commands.  Environment variables are never re-parsed by the shell and
 *   are the recommended safe mechanism for passing untrusted content.
 */
function substituteTokens(value: string, ctx: CommandTokenContext): string {
  return value
    .replaceAll("{event}", ctx.event)
    .replaceAll("{message}", ctx.message)
    .replaceAll("{sessionTitle}", ctx.sessionTitle ?? "")
    .replaceAll("{agentName}", ctx.agentName ?? "")
    .replaceAll("{projectName}", ctx.projectName ?? "")
    .replaceAll("{timestamp}", ctx.timestamp ?? "")
    .replaceAll("{turn}", ctx.turn != null ? String(ctx.turn) : "");
}

/**
 * Build the `OC_*` environment variables that expose all token values safely.
 * These are merged onto `process.env` so child processes can reference
 * `$OC_MESSAGE`, `$OC_EVENT`, etc. without string-substitution injection risk.
 */
function buildTokenEnv(ctx: CommandTokenContext): Record<string, string> {
  return {
    OC_EVENT: ctx.event,
    OC_MESSAGE: ctx.message,
    OC_SESSION_TITLE: ctx.sessionTitle ?? "",
    OC_AGENT_NAME: ctx.agentName ?? "",
    OC_PROJECT_NAME: ctx.projectName ?? "",
    OC_TIMESTAMP: ctx.timestamp ?? "",
    OC_TURN: ctx.turn != null ? String(ctx.turn) : "",
  };
}

export function runCommand(config: NotifierConfig, ctx: CommandTokenContext, logger: Logger = noopLogger): void {
  if (!config.command.enabled || !config.command.path) return;

  const command = substituteTokens(config.command.path, ctx);
  const args = (config.command.args ?? []).map((arg) => substituteTokens(arg, ctx));

  if (command.trim() === "") {
    logger.warn("command path is empty after token substitution, skipping spawn", {
      event: ctx.event,
    });
    return;
  }

  const env = { ...process.env, ...buildTokenEnv(ctx) };

  const proc = spawn(command, args, { stdio: "ignore", detached: true, env });
  proc.on("error", (err) => {
    logger.warn("command spawn failed", {
      event: ctx.event,
      command,
      error: err.message,
    });
  });
  proc.unref();
}
