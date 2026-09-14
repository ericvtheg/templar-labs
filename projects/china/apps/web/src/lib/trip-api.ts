export async function tripApi<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/trip/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(result.error ?? "The request didn’t finish. Try again.");
  }
  return result;
}
