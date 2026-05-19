import { statSync } from "node:fs";
import { getConfigPath, loadConfig } from "./loader.js";
import type { NotifierConfig } from "./schema.js";

export interface ConfigService {
  get(): NotifierConfig;
  invalidate(): void;
}

export interface ConfigServiceOptions {
  ttlMs?: number;
}

interface CacheEntry {
  config: NotifierConfig;
  expiresAt: number;
  mtimeMs: number | null;
  path: string;
}

function readMtime(path: string): number | null {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

export function createConfigService(options: ConfigServiceOptions = {}): ConfigService {
  const ttlMs = options.ttlMs ?? 30_000;
  let cache: CacheEntry | null = null;

  function refresh(): NotifierConfig {
    const path = getConfigPath();
    const config = loadConfig();
    cache = {
      config,
      expiresAt: Date.now() + ttlMs,
      mtimeMs: readMtime(path),
      path,
    };
    return config;
  }

  return {
    get() {
      const now = Date.now();
      if (!cache) return refresh();

      const path = getConfigPath();
      if (path !== cache.path) return refresh();

      const currentMtime = readMtime(path);
      if (currentMtime !== cache.mtimeMs) return refresh();

      if (now > cache.expiresAt) return refresh();

      return cache.config;
    },
    invalidate() {
      cache = null;
    },
  };
}
