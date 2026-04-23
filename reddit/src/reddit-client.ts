/** Reddit API client. Script-app OAuth (password grant), in-memory token cache. */

const DEFAULT_TIMEOUT_MS = 30_000;
const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE_URL = "https://oauth.reddit.com";
const TOKEN_REFRESH_LEEWAY_MS = 60_000;

function getEnv(name: string): string {
  const v = process.env[name] || "";
  if (!v) throw new Error(`Missing ${name}. Set it as a global env var.`);
  return v;
}

function getUserAgent(): string {
  return process.env.REDDIT_USER_AGENT || "DNSFilter Social Listening/1.0";
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let inFlightToken: Promise<string> | null = null;

async function fetchToken(): Promise<string> {
  const clientId = getEnv("REDDIT_CLIENT_ID");
  const clientSecret = getEnv("REDDIT_CLIENT_SECRET");
  const username = getEnv("REDDIT_USERNAME");
  const password = getEnv("REDDIT_PASSWORD");

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "password",
    username,
    password,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": getUserAgent(),
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Reddit token ${res.status}: ${truncated || res.statusText}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    error?: string;
  };

  if (data.error || !data.access_token) {
    throw new Error(`Reddit token error: ${data.error || "no access_token returned"}`);
  }

  const expiresAt = Date.now() + data.expires_in * 1000 - TOKEN_REFRESH_LEEWAY_MS;
  tokenCache = { accessToken: data.access_token, expiresAt };
  return data.access_token;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  if (inFlightToken) return inFlightToken;

  inFlightToken = fetchToken().finally(() => {
    inFlightToken = null;
  });
  return inFlightToken;
}

export interface RedditRequestOptions {
  /** API path starting with /, e.g. "/r/sysadmin/new" */
  path: string;
  /** Query-string params */
  params?: Record<string, unknown>;
  timeoutMs?: number;
}

async function redditRequest<T = unknown>(opts: RedditRequestOptions): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(API_BASE_URL + opts.path);

  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  // Always request raw JSON (Reddit's default wraps in HTML for some endpoints)
  if (!url.searchParams.has("raw_json")) {
    url.searchParams.set("raw_json", "1");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "User-Agent": getUserAgent(),
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  // 401: token may have been revoked; invalidate cache and retry once.
  if (res.status === 401 && tokenCache) {
    tokenCache = null;
    return redditRequest<T>(opts);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Reddit API ${res.status}: ${truncated || res.statusText}`);
  }

  return (await res.json()) as T;
}

// ─── Listings ───────────────────────────────────────────────────────────────

export async function listNew(params: { subreddit: string; limit?: number; after?: string }) {
  const { subreddit, ...rest } = params;
  return redditRequest({
    path: `/r/${encodeURIComponent(subreddit)}/new`,
    params: rest,
  });
}

export async function listComments(params: { subreddit: string; limit?: number }) {
  const { subreddit, ...rest } = params;
  return redditRequest({
    path: `/r/${encodeURIComponent(subreddit)}/comments`,
    params: rest,
  });
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function search(params: {
  query: string;
  subreddit?: string;
  sort?: string;
  time?: string;
  limit?: number;
  after?: string;
}) {
  const { query, subreddit, sort, time, limit, after } = params;
  const path = subreddit
    ? `/r/${encodeURIComponent(subreddit)}/search`
    : `/search`;
  return redditRequest({
    path,
    params: {
      q: query,
      sort,
      t: time,
      limit,
      after,
      restrict_sr: subreddit ? "on" : undefined,
    },
  });
}

// ─── Thread (post + comments) ───────────────────────────────────────────────

export async function getThread(params: {
  thread_id: string;
  subreddit?: string;
  limit?: number;
  sort?: string;
}) {
  const { thread_id, subreddit, limit, sort } = params;
  const path = subreddit
    ? `/r/${encodeURIComponent(subreddit)}/comments/${encodeURIComponent(thread_id)}`
    : `/comments/${encodeURIComponent(thread_id)}`;
  return redditRequest({
    path,
    params: { limit, sort },
  });
}

// ─── User ───────────────────────────────────────────────────────────────────

export async function getUserAbout(username: string) {
  return redditRequest({
    path: `/user/${encodeURIComponent(username)}/about`,
  });
}
