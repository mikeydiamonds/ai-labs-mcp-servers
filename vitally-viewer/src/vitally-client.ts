/** Vitally REST API client — read-only, global API key (Basic auth). */

const DEFAULT_TIMEOUT_MS = 30_000;

function getApiKey(): string {
  const key = process.env.VITALLY_API_KEY || "";
  if (!key) {
    throw new Error("Missing VITALLY_API_KEY. Set it as a global env var.");
  }
  return key;
}

function getBaseUrl(): string {
  const dc = (process.env.VITALLY_DATA_CENTER || "US").toUpperCase();
  if (dc === "EU") return "https://rest.vitally-eu.io";
  const sub = process.env.VITALLY_SUBDOMAIN;
  if (!sub) {
    throw new Error("Missing VITALLY_SUBDOMAIN (required for US data center).");
  }
  return `https://${sub}.rest.vitally.io`;
}

function authHeader(): string {
  const token = Buffer.from(`${getApiKey()}:`).toString("base64");
  return `Basic ${token}`;
}

type QueryObject = { [k: string]: unknown };

export interface VitallyRequestOptions {
  /** Read-only client: only GET is supported. */
  path: string;
  query?: QueryObject;
  timeoutMs?: number;
}

function buildQuery(query?: QueryObject): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, val] of Object.entries(query)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      for (const item of val) params.append(k, String(item));
    } else {
      params.append(k, String(val));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

export async function vitallyRequest<T = unknown>(
  opts: VitallyRequestOptions
): Promise<T> {
  const url = `${getBaseUrl()}${opts.path}${buildQuery(opts.query)}`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(
      `Vitally API ${res.status} GET ${opts.path}: ${truncated || res.statusText}`
    );
  }

  if (res.status === 204) return {} as T;

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text().catch(() => "");
    return text as unknown as T;
  }
  return (await res.json()) as T;
}

// Common pagination params: { limit, from, sortBy }
export type ListParams = {
  limit?: number;
  from?: string;
  sortBy?: "createdAt" | "updatedAt";
  [k: string]: unknown;
};

// ─── Organizations ──────────────────────────────────────────────────────────

export const listOrganizations = (q: ListParams) =>
  vitallyRequest({ path: "/resources/organizations", query: q });

export const getOrganization = (id: string) =>
  vitallyRequest({ path: `/resources/organizations/${encodeURIComponent(id)}` });

// ─── Accounts ───────────────────────────────────────────────────────────────

export const listAccounts = (q: ListParams & { organizationId?: string }) => {
  const { organizationId, ...rest } = q;
  const path = organizationId
    ? `/resources/organizations/${encodeURIComponent(organizationId)}/accounts`
    : "/resources/accounts";
  return vitallyRequest({ path, query: rest });
};

export const getAccount = (id: string) =>
  vitallyRequest({ path: `/resources/accounts/${encodeURIComponent(id)}` });

export const getAccountHealthScores = (id: string) =>
  vitallyRequest({
    path: `/resources/accounts/${encodeURIComponent(id)}/healthScores`,
  });

// ─── Users ──────────────────────────────────────────────────────────────────

export const listUsers = (
  q: ListParams & { accountId?: string; organizationId?: string }
) => {
  const { accountId, organizationId, ...rest } = q;
  let path = "/resources/users";
  if (accountId) {
    path = `/resources/accounts/${encodeURIComponent(accountId)}/users`;
  } else if (organizationId) {
    path = `/resources/organizations/${encodeURIComponent(organizationId)}/users`;
  }
  return vitallyRequest({ path, query: rest });
};

export const getUser = (id: string) =>
  vitallyRequest({ path: `/resources/users/${encodeURIComponent(id)}` });

export const searchUsers = (q: {
  email?: string;
  externalId?: string;
  emailDomain?: string;
  limit?: number;
}) => vitallyRequest({ path: "/resources/users/search", query: q });

// ─── Conversations ──────────────────────────────────────────────────────────

export const listConversations = (
  q: ListParams & { accountId?: string; organizationId?: string }
) => {
  const { accountId, organizationId, ...rest } = q;
  let path = "/resources/conversations";
  if (accountId) {
    path = `/resources/accounts/${encodeURIComponent(accountId)}/conversations`;
  } else if (organizationId) {
    path = `/resources/organizations/${encodeURIComponent(organizationId)}/conversations`;
  }
  return vitallyRequest({ path, query: rest });
};

export const getConversation = (id: string) =>
  vitallyRequest({ path: `/resources/conversations/${encodeURIComponent(id)}` });

// ─── Notes ──────────────────────────────────────────────────────────────────

export const listNotes = (
  q: ListParams & { accountId?: string; organizationId?: string }
) => {
  const { accountId, organizationId, ...rest } = q;
  let path = "/resources/notes";
  if (accountId) {
    path = `/resources/accounts/${encodeURIComponent(accountId)}/notes`;
  } else if (organizationId) {
    path = `/resources/organizations/${encodeURIComponent(organizationId)}/notes`;
  }
  return vitallyRequest({ path, query: rest });
};

export const getNote = (id: string) =>
  vitallyRequest({ path: `/resources/notes/${encodeURIComponent(id)}` });

export const listNoteCategories = (q: ListParams) =>
  vitallyRequest({ path: "/resources/noteCategories", query: q });

// ─── Projects ───────────────────────────────────────────────────────────────

export const listProjects = (
  q: ListParams & { accountId?: string; organizationId?: string }
) => {
  const { accountId, organizationId, ...rest } = q;
  let path = "/resources/projects";
  if (accountId) {
    path = `/resources/accounts/${encodeURIComponent(accountId)}/projects`;
  } else if (organizationId) {
    path = `/resources/organizations/${encodeURIComponent(organizationId)}/projects`;
  }
  return vitallyRequest({ path, query: rest });
};

export const getProject = (id: string) =>
  vitallyRequest({ path: `/resources/projects/${encodeURIComponent(id)}` });

export const listProjectTemplates = (q: ListParams) =>
  vitallyRequest({ path: "/resources/projectTemplates", query: q });

export const listProjectCategories = (q: ListParams) =>
  vitallyRequest({ path: "/resources/projectCategories", query: q });

// ─── Tasks ──────────────────────────────────────────────────────────────────

export const listTasks = (
  q: ListParams & {
    accountId?: string;
    organizationId?: string;
    status?: string;
  }
) => {
  const { accountId, organizationId, ...rest } = q;
  let path = "/resources/tasks";
  if (accountId) {
    path = `/resources/accounts/${encodeURIComponent(accountId)}/tasks`;
  } else if (organizationId) {
    path = `/resources/organizations/${encodeURIComponent(organizationId)}/tasks`;
  }
  return vitallyRequest({ path, query: rest });
};

export const getTask = (id: string) =>
  vitallyRequest({ path: `/resources/tasks/${encodeURIComponent(id)}` });

export const listTaskCategories = (q: ListParams) =>
  vitallyRequest({ path: "/resources/taskCategories", query: q });

// ─── NPS Responses ──────────────────────────────────────────────────────────

export const listNpsResponses = (
  q: ListParams & { accountId?: string; organizationId?: string }
) => {
  const { accountId, organizationId, ...rest } = q;
  let path = "/resources/npsResponses";
  if (accountId) {
    path = `/resources/accounts/${encodeURIComponent(accountId)}/npsResponses`;
  } else if (organizationId) {
    path = `/resources/organizations/${encodeURIComponent(organizationId)}/npsResponses`;
  }
  return vitallyRequest({ path, query: rest });
};

export const getNpsResponse = (id: string) =>
  vitallyRequest({ path: `/resources/npsResponses/${encodeURIComponent(id)}` });

// ─── Custom Objects ─────────────────────────────────────────────────────────

export const listCustomObjects = (q: ListParams) =>
  vitallyRequest({ path: "/resources/customObjects", query: q });

export const getCustomObject = (id: string) =>
  vitallyRequest({ path: `/resources/customObjects/${encodeURIComponent(id)}` });

export const listCustomObjectInstances = (
  customObjectId: string,
  q: ListParams
) =>
  vitallyRequest({
    path: `/resources/customObjects/${encodeURIComponent(customObjectId)}/instances`,
    query: q,
  });

export const searchCustomObjectInstances = (
  customObjectId: string,
  q: Record<string, unknown>
) =>
  vitallyRequest({
    path: `/resources/customObjects/${encodeURIComponent(customObjectId)}/instances/search`,
    query: q,
  });

// ─── Meetings ───────────────────────────────────────────────────────────────

export const listMeetings = (
  q: ListParams & { accountId?: string; organizationId?: string }
) => {
  const { accountId, organizationId, ...rest } = q;
  let path = "/resources/meetings";
  if (accountId) {
    path = `/resources/accounts/${encodeURIComponent(accountId)}/meetings`;
  } else if (organizationId) {
    path = `/resources/organizations/${encodeURIComponent(organizationId)}/meetings`;
  }
  return vitallyRequest({ path, query: rest });
};

export const getMeeting = (id: string) =>
  vitallyRequest({ path: `/resources/meetings/${encodeURIComponent(id)}` });

export const listMeetingTranscripts = (q: ListParams) =>
  vitallyRequest({ path: "/resources/meetingTranscripts", query: q });

export const getMeetingTranscriptById = (id: string) =>
  vitallyRequest({
    path: `/resources/meetingTranscripts/${encodeURIComponent(id)}`,
  });

export const getMeetingTranscript = (meetingId: string) =>
  vitallyRequest({
    path: `/resources/meetings/${encodeURIComponent(meetingId)}/transcript`,
  });

// ─── Custom Surveys ─────────────────────────────────────────────────────────

export const listSurveyResponses = (surveyId: string, q: ListParams) =>
  vitallyRequest({
    path: `/resources/surveys/${encodeURIComponent(surveyId)}/responses`,
    query: q,
  });

export const getSurveyResponse = (responseId: string) =>
  vitallyRequest({
    path: `/resources/surveyResponses/${encodeURIComponent(responseId)}`,
  });

export const getSurveyQuestion = (questionId: string) =>
  vitallyRequest({
    path: `/resources/surveyQuestions/${encodeURIComponent(questionId)}`,
  });
