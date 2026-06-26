import type { NtfyTarget, WebhookEventOverrides } from "../config/schema.js";

export async function sendNtfy(
  target: NtfyTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
  timeoutMs?: number,
): Promise<void> {
  const headers: Record<string, string> = {
    ...target.headers,
    Title: title,
  };

  const priority = overrides?.priority ?? target.priority;
  if (priority !== undefined) headers.Priority = String(priority);

  const tags = overrides?.tags ?? target.tags;
  if (tags && tags.length > 0) headers.Tags = tags.join(",");

  if (target.basicAuth) {
    const credentials = btoa(`${target.basicAuth.username}:${target.basicAuth.password}`);
    headers.Authorization = `Basic ${credentials}`;
  }

  const signal = timeoutMs && timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const res = await fetch(target.url, { method: "POST", headers, body: message, signal });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ntfy webhook failed: ${res.status} ${res.statusText} ${text}`);
  }
}
