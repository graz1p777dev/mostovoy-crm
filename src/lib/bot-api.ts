// Client helper for the FastAPI bot backend, reached through the /api/backend proxy.
const BOT_API_BASE = "/api/backend";

// Ошибки без detail (401/403 от самого прокси, сетевой сбой) выглядели одинаково
// с любой ошибкой бэкенда — по тексту нельзя было понять, что вообще произошло.
async function botApiError(res: Response): Promise<Error> {
  let detail: string | undefined;
  try {
    const data = await res.json();
    detail = typeof data?.detail === "string" ? data.detail : undefined;
  } catch {
    /* тело не JSON — оставляем detail пустым */
  }
  return new Error(detail ? `Bot API ${res.status}: ${detail}` : `Bot API ${res.status}`);
}

export async function botGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BOT_API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw await botApiError(res);
  return res.json();
}

export async function botJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BOT_API_BASE}${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await botApiError(res);
  return res.json();
}
