export interface PendingPermission {
  id: string;
  key: string;
  sessionID: string;
  permissionID: string;
  createdAt: number;
}

const pendingMap = new Map<string, PendingPermission>();
let keyCounter = 1;

export function registerPendingPermission(sessionID: string, permissionID: string): string {
  const now = Date.now();
  // Prune entries older than 1 hour
  for (const [k, v] of pendingMap.entries()) {
    if (now - v.createdAt > 3600_000) {
      pendingMap.delete(k);
    }
  }

  const key = `k_${(keyCounter++).toString(36)}_${(now % 10000).toString(36)}`;
  pendingMap.set(key, {
    id: `${sessionID}:${permissionID}`,
    key,
    sessionID,
    permissionID,
    createdAt: now,
  });
  return key;
}

export function getPendingPermission(key: string): PendingPermission | undefined {
  return pendingMap.get(key);
}

export function removePendingPermission(key: string): void {
  pendingMap.delete(key);
}

export function clearPendingPermissions(): void {
  pendingMap.clear();
  keyCounter = 1;
}
