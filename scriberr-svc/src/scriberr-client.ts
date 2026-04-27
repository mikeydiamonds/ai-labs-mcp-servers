/** Scriberr API client. Global API key auth (X-API-Key header). */

const DEFAULT_TIMEOUT_MS = 60_000;

function getApiKey(): string {
  const key = process.env.SCRIBERR_API_KEY || "";
  if (!key) {
    throw new Error("Missing SCRIBERR_API_KEY. Set it as a global env var.");
  }
  return key;
}

function getBaseUrl(): string {
  const url = process.env.SCRIBERR_BASE_URL || "";
  if (!url) {
    throw new Error("Missing SCRIBERR_BASE_URL. Set it to your Scriberr instance, e.g. https://scriberr.example.com");
  }
  return url.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  return {
    "X-API-Key": getApiKey(),
    Accept: "application/json",
  };
}

async function request<T = unknown>(
  method: string,
  path: string,
  opts: {
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const url = new URL(path, getBaseUrl() + "/");
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const headers: Record<string, string> = { ...authHeaders() };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
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
    throw new Error(`Scriberr API ${res.status} ${method} ${path}: ${truncated || res.statusText}`);
  }

  // Some endpoints (DELETE) may return empty bodies.
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    return (await res.text()) as unknown as T;
  }
  return (await res.json()) as T;
}

// ─── Types ───────────────────────────────────────────────────────────────

export interface TranscriptionJob {
  id: string;
  title: string;
  status: string;
  audio_path?: string;
  transcript?: string;
  diarization?: boolean;
  is_multi_track?: boolean;
  created_at?: string;
  updated_at?: string;
  parameters?: Record<string, unknown>;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface Transcript {
  text: string;
  language?: string;
  segments?: TranscriptSegment[];
  word_segments?: unknown[];
  confidence?: number;
  processing_time?: number;
  model_used?: string;
}

export interface TranscriptEnvelope {
  available: boolean;
  job_id: string;
  title: string;
  status: string;
  transcript: Transcript;
  created_at?: string;
  updated_at?: string;
}

export interface SpeakerMapping {
  id: number;
  original_speaker: string;
  custom_name: string;
}

export interface WhisperXParams {
  model_family?: string;
  model?: string;
  device?: string;
  device_index?: number;
  batch_size?: number;
  compute_type?: string;
  task?: string;
  language?: string;
  diarize?: boolean;
  diarize_model?: string;
  min_speakers?: number;
  max_speakers?: number;
  vad_method?: string;
  vad_onset?: number;
  vad_offset?: number;
  no_align?: boolean;
  output_format?: string;
  hf_token?: string;
  [key: string]: unknown;
}

// ─── Endpoints ──────────────────────────────────────────────────────────

export interface ListParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  status?: string;
  q?: string;
  updated_after?: string;
}

export async function listJobs(params: ListParams = {}) {
  return request<{ jobs: TranscriptionJob[]; pagination: Record<string, number> }>(
    "GET",
    "api/v1/transcription/list",
    { query: params as Record<string, string | number | boolean | undefined> }
  );
}

export async function getJob(id: string) {
  return request<TranscriptionJob>("GET", `api/v1/transcription/${encodeURIComponent(id)}`);
}

export async function getStatus(id: string) {
  return request<TranscriptionJob>("GET", `api/v1/transcription/${encodeURIComponent(id)}/status`);
}

export async function getTranscript(id: string) {
  return request<TranscriptEnvelope>("GET", `api/v1/transcription/${encodeURIComponent(id)}/transcript`);
}

export async function getSpeakers(id: string) {
  return request<SpeakerMapping[]>("GET", `api/v1/transcription/${encodeURIComponent(id)}/speakers`);
}

export async function setSpeakers(
  id: string,
  mappings: { original_speaker: string; custom_name: string }[]
) {
  return request<SpeakerMapping[]>("POST", `api/v1/transcription/${encodeURIComponent(id)}/speakers`, {
    body: { mappings },
  });
}

export async function killJob(id: string) {
  return request<Record<string, string>>("POST", `api/v1/transcription/${encodeURIComponent(id)}/kill`);
}

export async function deleteJob(id: string) {
  return request<Record<string, string>>("DELETE", `api/v1/transcription/${encodeURIComponent(id)}`);
}

export async function updateTitle(id: string, title: string) {
  return request<Record<string, unknown>>(
    "PUT",
    `api/v1/transcription/${encodeURIComponent(id)}/title`,
    { body: { title } }
  );
}

export async function getModels() {
  return request<Record<string, unknown>>("GET", "api/v1/transcription/models");
}

export async function listProfiles() {
  return request<unknown[]>("GET", "api/v1/profiles/");
}

export async function submitYoutube(url: string, title?: string) {
  return request<TranscriptionJob>("POST", "api/v1/transcription/youtube", {
    body: title ? { url, title } : { url },
    timeoutMs: 120_000,
  });
}

export async function startJob(id: string, params: WhisperXParams) {
  return request<TranscriptionJob>("POST", `api/v1/transcription/${encodeURIComponent(id)}/start`, {
    body: params,
  });
}
