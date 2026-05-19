import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConfigService } from "../src/config/service.js";

let tempDir: string;
let originalEnv: string | undefined;

function pointConfigAt(path: string): void {
  process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH = path;
}

beforeEach(() => {
  originalEnv = process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH;
  tempDir = mkdtempSync(join(tmpdir(), "wnotify-svc-"));
});

afterEach(() => {
  if (originalEnv === undefined) delete process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH;
  else process.env.OPENCODE_WEBHOOK_NOTIFIER_CONFIG_PATH = originalEnv;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("createConfigService", () => {
  it("caches config across calls when file is unchanged", () => {
    const path = join(tempDir, "cfg.json");
    writeFileSync(path, JSON.stringify({ showProjectName: false }));
    pointConfigAt(path);

    const svc = createConfigService({ ttlMs: 60_000 });
    const a = svc.get();
    const b = svc.get();
    expect(a).toBe(b);
  });

  it("invalidates cache when mtime changes", () => {
    const path = join(tempDir, "cfg.json");
    writeFileSync(path, JSON.stringify({ showProjectName: false }));
    pointConfigAt(path);

    const svc = createConfigService({ ttlMs: 60_000 });
    const a = svc.get();
    expect(a.showProjectName).toBe(false);

    writeFileSync(path, JSON.stringify({ showProjectName: true }));
    const future = new Date(Date.now() + 5000);
    utimesSync(path, future, future);

    const b = svc.get();
    expect(b.showProjectName).toBe(true);
  });

  it("expires after ttlMs", async () => {
    const path = join(tempDir, "cfg.json");
    writeFileSync(path, JSON.stringify({ showProjectName: false }));
    pointConfigAt(path);

    const svc = createConfigService({ ttlMs: 5 });
    const a = svc.get();
    await new Promise((resolve) => setTimeout(resolve, 15));
    const b = svc.get();
    expect(a).not.toBe(b);
  });

  it("invalidate() forces a fresh read", () => {
    const path = join(tempDir, "cfg.json");
    writeFileSync(path, JSON.stringify({ showProjectName: false }));
    pointConfigAt(path);

    const svc = createConfigService({ ttlMs: 60_000 });
    const a = svc.get();
    svc.invalidate();
    const b = svc.get();
    expect(a).not.toBe(b);
  });

  it("returns defaults when file does not exist", () => {
    pointConfigAt(join(tempDir, "missing.json"));
    const svc = createConfigService();
    const cfg = svc.get();
    expect(cfg.webhook.enabled).toBe(true);
    expect(cfg.showProjectName).toBe(true);
  });
});
