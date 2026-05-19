import type { DiscordTarget, WebhookEventOverrides } from "../config/schema.js";
import { postJson } from "./http.js";

const DISCORD_DEFAULT_COLOR = 0x5865f2;

export async function sendDiscord(
  target: DiscordTarget,
  title: string,
  message: string,
  overrides?: WebhookEventOverrides,
): Promise<void> {
  const embedColor = overrides?.color ?? DISCORD_DEFAULT_COLOR;

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
