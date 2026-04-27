/**
 * Gong API client — read-only, global service-account credentials.
 * Auth is HTTP Basic: access_key as username, secret_key as password.
 *
 * Docs: https://help.gong.io/docs/receive-access-to-the-api
 * Base URL: https://api.gong.io (override via GONG_BASE_URL for region-specific tenants)
 * Rate limits: 3 req/sec, 10K req/day company-wide. We retry once on 429.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = "https://api.gong.io";

function getCredentials(): { accessKey: string; secretKey: string; baseUrl: string } {
  const accessKey = process.env.GONG_ACCESS_KEY || "";
  const secretKey = process.env.GONG_SECRET_KEY || "";
  if (!accessKey || !secretKey) {
    throw new Error(
      "Missing GONG_ACCESS_KEY or GONG_SECRET_KEY. Set both as global env vars."
    );
  }
  const baseUrl = (process.env.GONG_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  return { accessKey, secretKey, baseUrl };
}

function authHeader(accessKey: string, secretKey: string): string {
  const token = Buffer.from(`${accessKey}:${secretKey}`).toString("base64");
  return `Basic ${token}`;
}

interface GongRequestOptions {
  /** API path, e.g. "/v2/calls" or "/v2/calls/extensive" */
  path: string;
  /** HTTP method (default GET) */
  method?: "GET" | "POST";
  /** Query string params (GET) */
  query?: Record<string, string | number | boolean | string[] | undefined>;
  /** JSON body (POST) */
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

function buildQuery(query: GongRequestOptions["query"]): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) sp.append(key, String(v));
    } else {
      sp.append(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function gongRequest<T = unknown>(opts: GongRequestOptions): Promise<T> {
  const { accessKey, secretKey, baseUrl } = getCredentials();
  const url = `${baseUrl}${opts.path}${buildQuery(opts.query)}`;
  const method = opts.method ?? "GET";

  const headers: Record<string, string> = {
    Authorization: authHeader(accessKey, secretKey),
    Accept: "application/json",
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const doFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    try {
      return await fetch(url, { method, headers, body, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };

  let res = await doFetch();

  // Single retry on rate-limit, honoring Retry-After if present.
  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get("retry-after") || "1");
    const waitMs = Math.min(Math.max(retryAfter * 1000, 500), 5000);
    await new Promise((r) => setTimeout(r, waitMs));
    res = await doFetch();
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Gong API ${res.status}: ${truncated || res.statusText}`);
  }

  return (await res.json()) as T;
}

// ─── Calls ──────────────────────────────────────────────────────────────────

export interface ListCallsParams {
  fromDateTime?: string;
  toDateTime?: string;
  cursor?: string;
  workspaceId?: string;
  callIds?: string[];
}

export async function listCalls(params: ListCallsParams) {
  return gongRequest({
    path: "/v2/calls",
    query: {
      fromDateTime: params.fromDateTime,
      toDateTime: params.toDateTime,
      cursor: params.cursor,
      workspaceId: params.workspaceId,
      callIds: params.callIds,
    },
  });
}

export interface ExtensiveCallsFilter {
  callIds?: string[];
  fromDateTime?: string;
  toDateTime?: string;
  workspaceId?: string;
  primaryUserIds?: string[];
}

export interface ExtensiveContentSelector {
  context?: "None" | "Basic" | "Extended";
  exposedFields?: {
    parties?: boolean;
    content?: { topics?: boolean; trackers?: boolean; brief?: boolean; outline?: boolean; highlights?: boolean; callOutcome?: boolean; keyPoints?: boolean };
    interaction?: { speakers?: boolean; questions?: boolean; video?: boolean; personInteractionStats?: boolean };
    collaboration?: { publicComments?: boolean };
    media?: boolean;
  };
}

export async function getCallExtensive(params: {
  filter: ExtensiveCallsFilter;
  contentSelector?: ExtensiveContentSelector;
  cursor?: string;
}) {
  return gongRequest({
    path: "/v2/calls/extensive",
    method: "POST",
    body: {
      filter: params.filter,
      ...(params.contentSelector ? { contentSelector: params.contentSelector } : {}),
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
  });
}

export async function getCallTranscript(params: {
  callIds?: string[];
  fromDateTime?: string;
  toDateTime?: string;
  workspaceId?: string;
  cursor?: string;
}) {
  return gongRequest({
    path: "/v2/calls/transcript",
    method: "POST",
    body: {
      filter: {
        callIds: params.callIds,
        fromDateTime: params.fromDateTime,
        toDateTime: params.toDateTime,
        workspaceId: params.workspaceId,
      },
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
  });
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function listUsers(params: { cursor?: string; includeAvatars?: boolean }) {
  return gongRequest({
    path: "/v2/users",
    query: {
      cursor: params.cursor,
      includeAvatars: params.includeAvatars,
    },
  });
}

export async function getUser(id: string) {
  return gongRequest({ path: `/v2/users/${encodeURIComponent(id)}` });
}

// ─── Stats ──────────────────────────────────────────────────────────────────

export async function getUserActivityStats(params: {
  fromDateTime: string;
  toDateTime: string;
  userIds?: string[];
  workspaceId?: string;
  cursor?: string;
}) {
  return gongRequest({
    path: "/v2/stats/activity/users",
    method: "POST",
    body: {
      filter: {
        fromDateTime: params.fromDateTime,
        toDateTime: params.toDateTime,
        userIds: params.userIds,
        workspaceId: params.workspaceId,
      },
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
  });
}

export async function getInteractionStats(params: {
  fromDateTime: string;
  toDateTime: string;
  userIds?: string[];
  workspaceId?: string;
  cursor?: string;
}) {
  return gongRequest({
    path: "/v2/stats/interaction",
    method: "POST",
    body: {
      filter: {
        fromDateTime: params.fromDateTime,
        toDateTime: params.toDateTime,
        userIds: params.userIds,
        workspaceId: params.workspaceId,
      },
      ...(params.cursor ? { cursor: params.cursor } : {}),
    },
  });
}

// ─── Workspaces ─────────────────────────────────────────────────────────────

export async function listWorkspaces() {
  return gongRequest({ path: "/v2/workspaces" });
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function listScorecards(params: { cursor?: string; workspaceId?: string }) {
  return gongRequest({
    path: "/v2/settings/scorecards",
    query: { cursor: params.cursor, workspaceId: params.workspaceId },
  });
}

export async function listTrackers(params: { cursor?: string; workspaceId?: string }) {
  return gongRequest({
    path: "/v2/settings/trackers",
    query: { cursor: params.cursor, workspaceId: params.workspaceId },
  });
}

export async function listTopics(params: { cursor?: string; workspaceId?: string }) {
  return gongRequest({
    path: "/v2/settings/topics",
    query: { cursor: params.cursor, workspaceId: params.workspaceId },
  });
}
