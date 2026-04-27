/** Plausible Analytics API client. Global API key auth, read-only. */

const DEFAULT_TIMEOUT_MS = 30_000;

function getApiKey(): string {
  const key = process.env.PLAUSIBLE_API_KEY || "";
  if (!key) {
    throw new Error("Missing PLAUSIBLE_API_KEY. Set it as a global env var.");
  }
  return key;
}

function getBaseUrl(): string {
  return process.env.PLAUSIBLE_BASE_URL || "https://plausible.io";
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    Accept: "application/json",
  };
}

// ─── Sites API (v1, GET) ─────────────────────────────────────────────────

async function getJson<T = unknown>(
  path: string,
  query?: Record<string, string | number | undefined>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const url = new URL(path, getBaseUrl());
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: authHeaders(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Plausible API ${res.status}: ${truncated || res.statusText}`);
  }

  return (await res.json()) as T;
}

export async function listSites(params: {
  limit?: number;
  after?: string;
  before?: string;
  team_id?: string;
}) {
  return getJson("/api/v1/sites", params);
}

export async function listTeams(params: {
  limit?: number;
  after?: string;
  before?: string;
}) {
  return getJson("/api/v1/sites/teams", params);
}

export async function getSite(siteId: string) {
  return getJson(`/api/v1/sites/${encodeURIComponent(siteId)}`);
}

export async function listGoals(params: {
  site_id: string;
  limit?: number;
  after?: string;
  before?: string;
}) {
  return getJson("/api/v1/sites/goals", params);
}

export async function listCustomProps(params: { site_id: string }) {
  return getJson("/api/v1/sites/custom-props", params);
}

// ─── Stats API (v2, POST /api/v2/query) ─────────────────────────────────

export interface QueryPayload {
  site_id: string;
  date_range: string | [string, string];
  metrics: string[];
  dimensions?: string[];
  filters?: unknown[];
  order_by?: unknown[];
  include?: Record<string, unknown>;
  pagination?: { limit?: number; offset?: number };
}

export async function query(payload: QueryPayload): Promise<unknown> {
  const url = new URL("/api/v2/query", getBaseUrl());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Plausible API ${res.status}: ${truncated || res.statusText}`);
  }

  return await res.json();
}
