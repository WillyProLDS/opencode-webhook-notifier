import type { GotifyTarget, WebhookEventOverrides } from "../config/schema.js";
import { postJson } from "./http.js";

const GOTIFY_DEFAULT_PRIORITY = 5;

export async function sendGotify(
  target: GotifyTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
): Promise<void> {
  let url = target.url;
  if (target.token && !url.includes("token=")) {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}token=${encodeURIComponent(target.token)}`;
  }

  const payload = {
    title,
    message,
    priority: overrides?.gotifyPriority ?? target.priority ?? GOTIFY_DEFAULT_PRIORITY,
  };

  const res = await postJson(url, payload, target.headers, target.basicAuth);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gotify webhook failed: ${res.status} ${res.statusText} ${text}`);
  }
}
