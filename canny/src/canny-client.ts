/** Canny API client. Global API key auth. */

const DEFAULT_TIMEOUT_MS = 30_000;
const CANNY_BASE_URL = "https://canny.io/api";

function getApiKey(): string {
  const key = process.env.CANNY_API_KEY || "";
  if (!key) {
    throw new Error(
      "Missing CANNY_API_KEY. Set it as a global env var."
    );
  }
  return key;
}

export interface CannyRequestOptions {
  /** API version path, e.g. "/v1/boards/list" or "/v2/comments/list" */
  path: string;
  /** Additional body params beyond apiKey */
  params?: Record<string, unknown>;
  timeoutMs?: number;
}

export async function cannyRequest<T = unknown>(opts: CannyRequestOptions): Promise<T> {
  const url = `${CANNY_BASE_URL}${opts.path}`;

  const body: Record<string, unknown> = {
    apiKey: getApiKey(),
    ...opts.params,
  };

  // Strip undefined values
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key];
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Canny API ${res.status}: ${truncated || res.statusText}`);
  }

  return (await res.json()) as T;
}

// ─── Boards ─────────────────────────────────────────────────────────────────

export async function getBoard(id: string) {
  return cannyRequest({ path: "/v1/boards/retrieve", params: { id } });
}

export async function listBoards() {
  return cannyRequest<{ boards: unknown[] }>({ path: "/v1/boards/list" });
}

// ─── Posts ──────────────────────────────────────────────────────────────────

export async function getPost(params: { id?: string; boardID?: string; urlName?: string }) {
  return cannyRequest({ path: "/v1/posts/retrieve", params });
}

export async function listPosts(params: {
  boardID?: string;
  authorID?: string;
  companyID?: string;
  tagIDs?: string[];
  search?: string;
  sort?: string;
  status?: string;
  limit?: number;
  skip?: number;
}) {
  return cannyRequest<{ posts: unknown[]; hasMore: boolean }>({
    path: "/v1/posts/list",
    params,
  });
}

// ─── Comments ───────────────────────────────────────────────────────────────

export async function getComment(id: string) {
  return cannyRequest({ path: "/v1/comments/retrieve", params: { id } });
}

export async function listComments(params: {
  authorID?: string;
  boardID?: string;
  companyID?: string;
  postID?: string;
  limit?: number;
  cursor?: string;
}) {
  return cannyRequest<{ items: unknown[]; cursor: string; hasNextPage: boolean }>({
    path: "/v2/comments/list",
    params,
  });
}

// ─── Votes ──────────────────────────────────────────────────────────────────

export async function getVote(id: string) {
  return cannyRequest({ path: "/v1/votes/retrieve", params: { id } });
}

export async function listVotes(params: {
  boardID?: string;
  authorID?: string;
  postID?: string;
  limit?: number;
  skip?: number;
}) {
  return cannyRequest<{ votes: unknown[]; hasMore: boolean }>({
    path: "/v1/votes/list",
    params,
  });
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function getUser(id: string) {
  return cannyRequest({ path: "/v1/users/retrieve", params: { id } });
}

export async function listUsers(params: {
  limit?: number;
  cursor?: string;
}) {
  return cannyRequest<{ items: unknown[]; cursor: string; hasNextPage: boolean }>({
    path: "/v2/users/list",
    params,
  });
}

// ─── Categories ─────────────────────────────────────────────────────────────

export async function getCategory(id: string) {
  return cannyRequest({ path: "/v1/categories/retrieve", params: { id } });
}

export async function listCategories(params: {
  boardID?: string;
  limit?: number;
  skip?: number;
}) {
  return cannyRequest<{ categories: unknown[]; hasMore: boolean }>({
    path: "/v1/categories/list",
    params,
  });
}

// ─── Tags ───────────────────────────────────────────────────────────────────

export async function getTag(id: string) {
  return cannyRequest({ path: "/v1/tags/retrieve", params: { id } });
}

export async function listTags(params: {
  boardID?: string;
  limit?: number;
  skip?: number;
}) {
  return cannyRequest<{ tags: unknown[]; hasMore: boolean }>({
    path: "/v1/tags/list",
    params,
  });
}

// ─── Status Changes ────────────────────────────────────────────────────────

export async function listStatusChanges(params: {
  boardID?: string;
  postID?: string;
  limit?: number;
  cursor?: string;
}) {
  return cannyRequest<{ items: unknown[]; cursor: string; hasNextPage: boolean }>({
    path: "/v1/status_changes/list",
    params,
  });
}

// ─── Changelog Entries ─────────────────────────────────────────────────────

export async function listChangelogEntries(params: {
  labelIDs?: string[];
  limit?: number;
  skip?: number;
}) {
  return cannyRequest<{ entries: unknown[]; hasMore: boolean }>({
    path: "/v1/entries/list",
    params,
  });
}

// ─── Companies ──────────────────────────────────────────────────────────────

export async function listCompanies(params: {
  search?: string;
  segment?: string;
  limit?: number;
  cursor?: string;
}) {
  return cannyRequest<{ items: unknown[]; cursor: string; hasNextPage: boolean }>({
    path: "/v2/companies/list",
    params,
  });
}

// ─── Groups ─────────────────────────────────────────────────────────────────

export async function getGroup(params: { id?: string; urlName?: string }) {
  return cannyRequest({ path: "/v1/groups/retrieve", params });
}

export async function listGroups(params: {
  limit?: number;
  cursor?: string;
}) {
  return cannyRequest<{ items: unknown[]; cursor: string; hasNextPage: boolean }>({
    path: "/v1/groups/list",
    params,
  });
}

// ─── Ideas ──────────────────────────────────────────────────────────────────

export async function getIdea(params: { id?: string; urlName?: string }) {
  return cannyRequest({ path: "/v1/ideas/retrieve", params });
}

export async function listIdeas(params: {
  boardID?: string;
  limit?: number;
  cursor?: string;
}) {
  return cannyRequest<{ items: unknown[]; cursor: string; hasNextPage: boolean }>({
    path: "/v1/ideas/list",
    params,
  });
}

// ─── Insights ───────────────────────────────────────────────────────────────

export async function getInsight(id: string) {
  return cannyRequest({ path: "/v1/insights/retrieve", params: { id } });
}

export async function listInsights(params: {
  limit?: number;
  cursor?: string;
}) {
  return cannyRequest<{ items: unknown[]; cursor: string; hasNextPage: boolean }>({
    path: "/v1/insights/list",
    params,
  });
}

// ─── Opportunities ──────────────────────────────────────────────────────────

export async function listOpportunities(params: {
  limit?: number;
  skip?: number;
}) {
  return cannyRequest<{ opportunities: unknown[]; hasMore: boolean }>({
    path: "/v1/opportunities/list",
    params,
  });
}
