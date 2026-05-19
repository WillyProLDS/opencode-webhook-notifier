import { spawn } from "node:child_process";
import type { EventType, NotifierConfig } from "../config/schema.js";

interface CommandTokenContext {
  event: EventType;
  message: string;
  sessionTitle?: string | null;
  agentName?: string | null;
  projectName?: string | null;
  timestamp?: string | null;
  turn?: number | null;
}

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

export function runCommand(config: NotifierConfig, ctx: CommandTokenContext): void {
  if (!config.command.enabled || !config.command.path) return;

  const command = substituteTokens(config.command.path, ctx);
  const args = (config.command.args ?? []).map((arg) => substituteTokens(arg, ctx));

  const proc = spawn(command, args, { stdio: "ignore", detached: true });
  proc.on("error", () => undefined);
  proc.unref();
}
