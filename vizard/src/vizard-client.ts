/** Vizard API client. Global API key auth via VIZARDAI_API_KEY header. */

const DEFAULT_TIMEOUT_MS = 60_000;
const VIZARD_BASE_URL = "https://elb-api.vizard.ai/hvizard-server-front/open-api/v1";

function getApiKey(): string {
  const key = process.env.VIZARD_API_KEY || "";
  if (!key) {
    throw new Error("Missing VIZARD_API_KEY. Set it as a global env var.");
  }
  return key;
}

export interface VizardRequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  timeoutMs?: number;
}

export async function vizardRequest<T = unknown>(opts: VizardRequestOptions): Promise<T> {
  const url = `${VIZARD_BASE_URL}${opts.path}`;

  const headers: Record<string, string> = {
    VIZARDAI_API_KEY: getApiKey(),
  };

  let body: string | undefined;
  if (opts.method === "POST") {
    headers["Content-Type"] = "application/json";
    const cleaned: Record<string, unknown> = { ...(opts.body ?? {}) };
    for (const key of Object.keys(cleaned)) {
      if (cleaned[key] === undefined) delete cleaned[key];
    }
    body = JSON.stringify(cleaned);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers,
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Vizard API ${res.status}: ${truncated || res.statusText}`);
  }

  return (await res.json()) as T;
}

// ─── Projects ───────────────────────────────────────────────────────────────

export interface SubmitLongVideoParams {
  videoUrl: string;
  videoType: number;
  lang?: string;
  preferLength?: number[];
  ratioOfClip?: number;
  templateId?: number;
  removeSilenceSwitch?: number;
  maxClipNumber?: number;
  keyword?: string;
  subtitleSwitch?: number;
  headlineSwitch?: number;
  emojiSwitch?: number;
  highlightSwitch?: number;
  autoBrollSwitch?: number;
  projectName?: string;
}

export async function submitLongVideo(params: SubmitLongVideoParams) {
  return vizardRequest({
    method: "POST",
    path: "/project/create",
    body: { ...params, lang: params.lang ?? "auto" },
  });
}

export interface SubmitShortVideoParams {
  videoUrl: string;
  videoType: number;
  lang?: string;
  ratioOfClip?: number;
  templateId?: number;
  removeSilenceSwitch?: number;
  subtitleSwitch?: number;
  headlineSwitch?: number;
  emojiSwitch?: number;
  highlightSwitch?: number;
  autoBrollSwitch?: number;
  projectName?: string;
}

export async function submitShortVideo(params: SubmitShortVideoParams) {
  return vizardRequest({
    method: "POST",
    path: "/project/create",
    body: { ...params, lang: params.lang ?? "auto", getClips: 0 },
  });
}

export async function getProjectClips(projectId: string) {
  return vizardRequest({
    method: "GET",
    path: `/project/query/${encodeURIComponent(projectId)}`,
  });
}

// ─── Social ─────────────────────────────────────────────────────────────────

export async function listSocialAccounts() {
  return vizardRequest({
    method: "GET",
    path: "/project/social-accounts",
  });
}

export interface PublishVideoParams {
  finalVideoId: number;
  socialAccountId: string;
  publishTime?: number;
  post?: string;
  title?: string;
}

export async function publishVideo(params: PublishVideoParams) {
  return vizardRequest({
    method: "POST",
    path: "/project/publish-video",
    body: { ...params },
  });
}

export interface GenerateAiSocialCaptionParams {
  finalVideoId: number;
  aiSocialPlatform?: string;
  tone?: string;
  voice?: string;
}

export async function generateAiSocialCaption(params: GenerateAiSocialCaptionParams) {
  return vizardRequest({
    method: "POST",
    path: "/project/ai-social",
    body: { ...params },
  });
}
