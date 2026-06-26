export const DEFAULT_HTTP_TIMEOUT_MS = 5000;

function buildSignal(timeoutMs?: number): AbortSignal | undefined {
  if (timeoutMs === undefined) return undefined;
  if (timeoutMs <= 0) return undefined;
  return AbortSignal.timeout(timeoutMs);
}

async function postJson(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  basicAuth?: { username: string; password: string },
  method: "POST" | "PUT" | "PATCH" = "POST",
  timeoutMs?: number,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (basicAuth) {
    const credentials = btoa(`${basicAuth.username}:${basicAuth.password}`);
    headers.Authorization = `Basic ${credentials}`;
  }

  return fetch(url, {
    method,
    headers,
    body: JSON.stringify(body),
    signal: buildSignal(timeoutMs),
  });
}

export { postJson };
