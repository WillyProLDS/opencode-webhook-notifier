import type { WebhookTarget, WebhookEventOverrides } from "./config.js";

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debounce(key: string, fn: () => void, ms = 1000): void {
  const existing = debounceTimers.get(key);
  if (existing !== undefined) clearTimeout(existing);
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn();
    }, ms),
  );
}

async function postJson(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  basicAuth?: { username: string; password: string },
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (basicAuth) {
    const credentials = btoa(`${basicAuth.username}:${basicAuth.password}`);
    headers["Authorization"] = `Basic ${credentials}`;
  }

  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Discord
// ---------------------------------------------------------------------------

/**
 * Send a message to a Discord webhook URL.
 *
 * Discord webhooks accept a JSON payload with `content`, optional
 * `username` / `avatar_url` overrides, and optional `embeds`.
 */
async function sendDiscord(
  target: WebhookTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
): Promise<void> {
  const embedColor = overrides?.color ?? 0x5865f2; // Discord blurple

  const payload: Record<string, unknown> = {
    content: `**${title}**\n${message}`,
    embeds: [
      {
        title,
        description: message,
        color: embedColor,
        timestamp: new Date().toISOString(),
        footer: { text: "OpenCode Webhook Notifier" },
      },
    ],
  };

  if (target.username) payload.username = target.username;
  if (target.avatarUrl) payload.avatar_url = target.avatarUrl;

  const res = await postJson(target.url, payload, target.headers, target.basicAuth);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${res.statusText} ${text}`);
  }
}

// ---------------------------------------------------------------------------
// ntfy
// ---------------------------------------------------------------------------

/**
 * Send a message via ntfy.
 *
 * ntfy expects POST to `{server}/{topic}` with special headers:
 *   Title, Priority, Tags
 * Body is plain text.
 */
async function sendNtfy(
  target: WebhookTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
): Promise<void> {
  const headers: Record<string, string> = {
    ...target.headers,
    Title: title,
  };

  const priority = overrides?.priority ?? target.priority;
  if (priority !== undefined) {
    headers["Priority"] = String(priority);
  }

  const tags = overrides?.tags ?? target.tags;
  if (tags && tags.length > 0) {
    headers["Tags"] = tags.join(",");
  }

  if (target.basicAuth) {
    const credentials = btoa(`${target.basicAuth.username}:${target.basicAuth.password}`);
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const res = await fetch(target.url, {
    method: "POST",
    headers,
    body: message,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ntfy webhook failed: ${res.status} ${res.statusText} ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Gotify
// ---------------------------------------------------------------------------

/**
 * Send a message via Gotify.
 *
 * Gotify expects POST to `{server}/message?token={appToken}` with JSON body:
 *   { title, message, priority, extras? }
 */
async function sendGotify(
  target: WebhookTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
): Promise<void> {
  // Build URL with token if provided
  let url = target.url;
  if (target.token && !url.includes("token=")) {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}token=${encodeURIComponent(target.token)}`;
  }

  const payload = {
    title,
    message,
    priority: overrides?.gotifyPriority ?? target.priority ?? 5,
  };

  const res = await postJson(url, payload, target.headers, target.basicAuth);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gotify webhook failed: ${res.status} ${res.statusText} ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a webhook notification to ALL configured targets.
 *
 * Fire-and-forget: each target is attempted in parallel via
 * `Promise.allSettled`. Errors are logged but never thrown.
 *
 * Calls are debounced per event type (1000 ms default).
 *
 * @param targets  Array of webhook target configurations.
 * @param title    Short title for the notification.
 * @param message  Body text of the notification.
 * @param eventType  Event type key used for debouncing (e.g. "permission", "complete").
 * @param overrides  Per-event overrides (priority, tags, color, etc.).
 */
export function sendWebhook(
  targets: WebhookTarget[],
  title: string,
  message: string,
  eventType: string,
  overrides?: WebhookEventOverrides,
): void {
  if (!targets || targets.length === 0) return;

  debounce(`webhook-${eventType}`, async () => {
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        switch (target.type) {
          case "discord":
            await sendDiscord(target, title, message, overrides);
            break;
          case "ntfy":
            await sendNtfy(target, title, message, overrides);
            break;
          case "gotify":
            await sendGotify(target, title, message, overrides);
            break;
          default:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            console.warn(`[webhook-notifier] Unknown webhook type: ${(target as any).type}`);
        }
      }),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[webhook-notifier] Webhook send failed:", result.reason);
      }
    }
  });
}
