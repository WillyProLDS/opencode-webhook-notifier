async function postJson(
  url: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  basicAuth?: { username: string; password: string },
  method: "POST" | "PUT" | "PATCH" = "POST",
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
  });
}

export { postJson };
