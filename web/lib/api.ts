/** A non-2xx response; `status` lets callers react to specific failures (e.g. 409). */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(payload.error || `リクエストに失敗しました (${res.status})`, res.status);
  }
  return res.json();
}
