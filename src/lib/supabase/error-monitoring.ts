/**
 * Supabase browser client error monitoring via fetch interception.
 *
 * Wraps the global fetch passed to createBrowserClient to intercept
 * PostgREST responses. When a non-2xx response is detected, parses
 * the error body and reports to /api/_internal/log-query-error.
 *
 * Single interception point — no chain-method gaps. Every PostgREST
 * request goes through fetch, so every error is caught.
 */

let reportCount = 0;
let reportWindowStart = Date.now();
const MAX_REPORTS_PER_WINDOW = 10;
const WINDOW_MS = 60 * 1000;

function shouldReport(): boolean {
  const now = Date.now();
  if (now - reportWindowStart > WINDOW_MS) {
    reportCount = 0;
    reportWindowStart = now;
  }
  if (reportCount >= MAX_REPORTS_PER_WINDOW) return false;
  reportCount++;
  return true;
}

function extractTableFromUrl(url: string): string {
  const match = url.match(/\/rest\/v1\/([^?/]+)/);
  return match ? decodeURIComponent(match[1]) : 'unknown';
}

function reportError(
  table: string,
  method: string,
  body: any,
  url: string,
  status: number,
): void {
  if (!shouldReport()) return;

  const payload = {
    table,
    operation: method,
    errorCode: body?.code ?? `HTTP_${status}`,
    errorMessage: body?.message ?? `PostgREST returned ${status}`,
    errorHint: body?.hint ?? body?.details ?? '',
    pageUrl: typeof window !== 'undefined' ? window.location.href : '',
    timestamp: new Date().toISOString(),
  };

  console.error(`[supabase-error] ${table} ${method} (${status}):`, body?.message ?? body);

  fetch('/api/_internal/log-query-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Returns a fetch wrapper that intercepts PostgREST error responses.
 * Pass to createBrowserClient via { global: { fetch: monitoringFetch() } }.
 */
export function monitoringFetch(originalFetch: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await originalFetch(input, init);

    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.includes('/rest/v1/') && !response.ok) {
      const cloned = response.clone();
      try {
        const body = await cloned.json();
        const table = extractTableFromUrl(url);
        const method = init?.method ?? 'GET';
        reportError(table, method, body, url, response.status);
      } catch {
        // Body wasn't JSON or parsing failed — skip silently
      }
    }

    return response;
  };
}
