import type { PluginInput } from "@opencode-ai/plugin";
import type { PermissionDetails } from "../config/schema.js";

export function extractPermissionDetails(raw: Record<string, unknown> | null | undefined): PermissionDetails | null {
  if (!raw || typeof raw !== "object") return null;

  const id =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.requestID === "string"
        ? raw.requestID
        : typeof raw.permissionID === "string"
          ? raw.permissionID
          : null;

  const permission =
    typeof raw.permission === "string" ? raw.permission : typeof raw.type === "string" ? raw.type : null;

  let patterns: string[] = [];
  if (Array.isArray(raw.patterns)) {
    patterns = raw.patterns.filter((p): p is string => typeof p === "string");
  } else if (Array.isArray(raw.pattern)) {
    patterns = raw.pattern.filter((p): p is string => typeof p === "string");
  } else if (typeof raw.pattern === "string") {
    patterns = [raw.pattern];
  } else if (typeof raw.patterns === "string") {
    patterns = [raw.patterns];
  }

  let always: string[] = [];
  if (Array.isArray(raw.always)) {
    always = raw.always.filter((a): a is string => typeof a === "string");
  } else if (typeof raw.always === "string") {
    always = [raw.always];
  }

  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : null;

  const title = typeof raw.title === "string" ? raw.title : typeof raw.message === "string" ? raw.message : null;
  const tool =
    raw.tool && typeof raw.tool === "object" && !Array.isArray(raw.tool) ? (raw.tool as Record<string, unknown>) : null;
  const messageID =
    typeof raw.messageID === "string" ? raw.messageID : typeof tool?.messageID === "string" ? tool.messageID : null;
  const callID = typeof raw.callID === "string" ? raw.callID : typeof tool?.callID === "string" ? tool.callID : null;

  return {
    id,
    permission,
    patterns: patterns.length > 0 ? patterns : null,
    always: always.length > 0 ? always : null,
    metadata,
    title,
    messageID,
    callID,
  };
}

export async function enrichPermissionDetails(
  client: PluginInput["client"],
  sessionID: string | null,
  permission: PermissionDetails | null,
): Promise<PermissionDetails | null> {
  if (!permission || !sessionID || !permission.messageID) return permission;

  try {
    const response = await client.session.message({
      path: { id: sessionID, messageID: permission.messageID },
    });
    const parts = response.data?.parts;
    if (!Array.isArray(parts)) return permission;

    const toolIndex = parts.findIndex(
      (part) =>
        part.type === "tool" &&
        (!permission.callID || part.callID === permission.callID || part.id === permission.callID),
    );
    const toolPart = toolIndex >= 0 ? parts[toolIndex] : undefined;
    const input =
      toolPart?.type === "tool" && toolPart.state && "input" in toolPart.state ? toolPart.state.input : undefined;
    const toolInput = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
    const description = typeof toolInput?.description === "string" ? toolInput.description.trim() : null;
    const command = typeof toolInput?.command === "string" ? toolInput.command.trim() : null;
    const step =
      description && !isToolEcho(description, permission.permission, command)
        ? description
        : summarizeCommand(permission.permission, command);

    const purposeParts = (toolIndex >= 0 ? parts.slice(0, toolIndex) : parts).filter(
      (part) => part.type === "text" && !part.synthetic && part.text.trim().length > 0,
    );
    const purposePart = purposeParts.at(-1);
    const purpose = purposePart?.type === "text" ? purposePart.text.trim() : null;

    return { ...permission, step: step ?? null, purpose: purpose && purpose !== step ? purpose : null };
  } catch {
    return permission;
  }
}

function isToolEcho(description: string, tool: string | null | undefined, command: string | null): boolean {
  if (!tool || !command) return false;
  return description.trim().toLowerCase() === `${tool}: ${command}`.toLowerCase();
}

function summarizeCommand(tool: string | null | undefined, command: string | null): string | null {
  if (tool !== "bash" || !command || !/(?:^|\s)git\s+commit(?:\s|$)/.test(command)) return null;

  const messages = Array.from(command.matchAll(/(?:^|\s)-m\s+(?:"([^"]*)"|'([^']*)'|(\S+))/g))
    .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
    .filter((message) => message.length > 0);
  const [subject, body] = messages;
  if (!subject) return "Create Git commit";

  const summary = body?.replace(/\s+/g, " ").trim();
  return summary ? `Create commit "${subject}": ${summary}` : `Create commit "${subject}"`;
}

export function formatSuggestedPermissionRule(perm: PermissionDetails): string {
  const permType = perm.permission ?? "tool";
  const rules = perm.always && perm.always.length > 0 ? perm.always : (perm.patterns ?? []);

  if (rules.length === 0) {
    return `"${permType}": "allow"`;
  }

  const obj: Record<string, string> = {};
  for (const r of rules) {
    obj[r] = "allow";
  }

  return `"${permType}": ${JSON.stringify(obj, null, 2)}`;
}

export function formatPermissionSummary(perm: PermissionDetails): {
  type: string;
  target: string;
  rule: string;
} {
  const type = perm.permission ?? "unknown";

  let target = "";
  if (perm.patterns && perm.patterns.length > 0) {
    target = perm.patterns.join(", ");
  } else if (perm.metadata) {
    if (typeof perm.metadata.command === "string") target = perm.metadata.command;
    else if (typeof perm.metadata.path === "string") target = perm.metadata.path;
    else if (typeof perm.metadata.file === "string") target = perm.metadata.file;
    else target = JSON.stringify(perm.metadata);
  } else if (perm.title) {
    target = perm.title;
  } else {
    target = "N/A";
  }

  const rule = formatSuggestedPermissionRule(perm);

  return { type, target, rule };
}
