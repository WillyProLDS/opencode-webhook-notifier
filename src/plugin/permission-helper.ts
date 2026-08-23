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

  const title = typeof raw.title === "string" ? raw.title : null;

  return {
    id,
    permission,
    patterns: patterns.length > 0 ? patterns : null,
    always: always.length > 0 ? always : null,
    metadata,
    title,
  };
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
