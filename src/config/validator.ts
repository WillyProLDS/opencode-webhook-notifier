import { z } from "zod";
import type { EventConfig, WebhookTarget } from "./schema.js";

const nonEmptyString = (field: string) =>
  z.string({ message: `${field} must be a non-empty string` }).min(1, `${field} must be a non-empty string`);

const positiveNumber = (field: string) =>
  z.number({ message: `${field} must be a positive number` }).positive(`${field} must be a positive number`);

const nonNegativeNumber = (field: string) =>
  z.number({ message: `${field} must be a number >= 0` }).nonnegative(`${field} must be a number >= 0`);

const stringArray = z.array(z.string());

const headersSchema = z.record(z.string(), z.string(), { message: "headers must be a Record<string, string>" });

const basicAuthSchema = z.object({
  username: nonEmptyString("basicAuth.username"),
  password: nonEmptyString("basicAuth.password"),
});

const retrySchema = z.object({
  maxAttempts: z.number().int().positive("retry.maxAttempts must be a positive integer").optional(),
  initialDelayMs: z.number().int().nonnegative("retry.initialDelayMs must be a non-negative integer").optional(),
  maxDelayMs: z.number().int().nonnegative("retry.maxDelayMs must be a non-negative integer").optional(),
});

const circuitBreakerSchema = z.object({
  failureThreshold: z.number().int().positive("circuitBreaker.failureThreshold must be a positive integer").optional(),
  cooldownMs: z.number().int().nonnegative("circuitBreaker.cooldownMs must be a non-negative integer").optional(),
});

const baseTargetOptions = {
  name: z.string().optional(),
  retry: retrySchema.optional(),
  circuitBreaker: circuitBreakerSchema.optional(),
};

const discordTargetSchema = z.object({
  ...baseTargetOptions,
  type: z.literal("discord"),
  url: nonEmptyString("url"),
  username: z.string().optional(),
  avatarUrl: z.string().optional(),
  headers: headersSchema.optional(),
  basicAuth: basicAuthSchema.optional(),
});

const ntfyTargetSchema = z.object({
  ...baseTargetOptions,
  type: z.literal("ntfy"),
  url: nonEmptyString("url"),
  topic: z.string().optional(),
  priority: z.number().int().min(1).max(5, "ntfy priority must be between 1 and 5").optional(),
  tags: stringArray.optional(),
  headers: headersSchema.optional(),
  basicAuth: basicAuthSchema.optional(),
});

const gotifyTargetSchema = z.object({
  ...baseTargetOptions,
  type: z.literal("gotify"),
  url: nonEmptyString("url"),
  token: z.string().optional(),
  priority: z.number().int().min(0).max(10, "gotify priority must be between 0 and 10").optional(),
  headers: headersSchema.optional(),
  basicAuth: basicAuthSchema.optional(),
});

const telegramTargetSchema = z.object({
  ...baseTargetOptions,
  type: z.literal("telegram"),
  botToken: nonEmptyString("botToken is required for telegram targets"),
  chatId: z.union([z.string(), z.number()], {
    message: "chatId must be a string or number for telegram targets",
  }),
  parseMode: z.enum(["MarkdownV2", "HTML", "Markdown"]).optional(),
  disableNotification: z.boolean().optional(),
  disableLinkPreview: z.boolean().optional(),
  messageThreadId: z.number().int().optional(),
  headers: headersSchema.optional(),
});

const genericTargetSchema = z.object({
  ...baseTargetOptions,
  type: z.literal("generic"),
  url: nonEmptyString("url"),
  method: z.enum(["POST", "PUT", "PATCH"]).optional(),
  bodyTemplate: z.unknown().optional(),
  headers: headersSchema.optional(),
  basicAuth: basicAuthSchema.optional(),
  bearer: z.string().optional(),
});

export const webhookTargetSchema: z.ZodType<WebhookTarget> = z.discriminatedUnion("type", [
  discordTargetSchema,
  ntfyTargetSchema,
  gotifyTargetSchema,
  telegramTargetSchema,
  genericTargetSchema,
]);

export const eventConfigSchema: z.ZodType<EventConfig> = z.preprocess(
  (val) => {
    if (typeof val === "boolean") return { webhook: val, command: val };
    return val;
  },
  z.object({
    webhook: z.boolean({ message: "events.<event>.webhook must be a boolean" }),
    command: z.boolean({ message: "events.<event>.command must be a boolean" }),
  }),
);

export const commandConfigSchema = z.object({
  enabled: z.boolean().optional(),
  path: z.string().optional(),
  args: stringArray.optional(),
  minDuration: z.number().nonnegative("command.minDuration must be a non-negative number").optional(),
});

export const webhookEventOverridesSchema = z
  .object({
    message: z.string().optional(),
    priority: z.number().optional(),
    tags: stringArray.optional(),
    color: z.number().optional(),
    gotifyPriority: z.number().optional(),
  })
  .optional();

export const webhookConfigSchema = z.object({
  enabled: z.boolean().optional(),
  targets: z.array(z.unknown()).optional(),
  events: z.record(z.string(), z.unknown()).optional(),
});

export const rawConfigSchema = z.object({
  timeout: positiveNumber("timeout").optional(),
  showProjectName: z.boolean().optional(),
  showSessionTitle: z.boolean().optional(),
  suppressWhenFocused: z.boolean().optional(),
  enableOnDesktop: z.boolean().optional(),
  focusCacheMs: nonNegativeNumber("focusCacheMs").optional(),
  command: commandConfigSchema.optional(),
  events: z
    .object({
      permission: z.union([z.boolean(), eventConfigSchema]).optional(),
      complete: z.union([z.boolean(), eventConfigSchema]).optional(),
      subagent_complete: z.union([z.boolean(), eventConfigSchema]).optional(),
      error: z.union([z.boolean(), eventConfigSchema]).optional(),
      question: z.union([z.boolean(), eventConfigSchema]).optional(),
      user_cancelled: z.union([z.boolean(), eventConfigSchema]).optional(),
      plan_exit: z.union([z.boolean(), eventConfigSchema]).optional(),
    })
    .optional(),
  messages: z
    .object({
      permission: z.string().optional(),
      complete: z.string().optional(),
      subagent_complete: z.string().optional(),
      error: z.string().optional(),
      question: z.string().optional(),
      user_cancelled: z.string().optional(),
      plan_exit: z.string().optional(),
    })
    .optional(),
  webhook: webhookConfigSchema.optional(),
});

export type RawConfig = z.infer<typeof rawConfigSchema>;
