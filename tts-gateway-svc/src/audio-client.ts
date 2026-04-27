/** Audio Gateway API client. Global API key auth via X-API-Key header. */

const DEFAULT_TIMEOUT_MS = 300_000; // 5 min — TTS/SFX/STT can be slow on GPU queue

function getApiKey(): string {
  const key = process.env.AUDIO_GATEWAY_API_KEY || "";
  if (!key) {
    throw new Error("Missing AUDIO_GATEWAY_API_KEY. Set it as a global env var.");
  }
  return key;
}

function getBaseUrl(): string {
  const url = process.env.AUDIO_GATEWAY_BASE_URL || "";
  if (!url) {
    throw new Error(
      "Missing AUDIO_GATEWAY_BASE_URL. Set it to your gateway, e.g. https://tts-gateway.example.com"
    );
  }
  return url.replace(/\/$/, "");
}

function authHeaders(): Record<string, string> {
  return { "X-API-Key": getApiKey() };
}

// ─── Generic helpers ────────────────────────────────────────────────────

async function handleError(res: Response, path: string): Promise<never> {
  const text = await res.text().catch(() => "");
  const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
  throw new Error(`Audio Gateway ${res.status} ${path}: ${truncated || res.statusText}`);
}

async function getJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "GET",
      headers: { ...authHeaders(), Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) await handleError(res, path);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson<T>(path: string, body: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) await handleError(res, path);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function postForBytes(
  path: string,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) await handleError(res, path);
    const buf = new Uint8Array(await res.arrayBuffer());
    return { bytes: buf, contentType: res.headers.get("content-type") || "application/octet-stream" };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAudio(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Failed to fetch source URL ${url}: HTTP ${res.status}`);
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    // Pick a reasonable filename from the URL path so the backend can pick extension.
    let filename = "audio";
    try {
      const u = new URL(url);
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last) filename = last;
    } catch {
      /* ignore */
    }
    return { bytes: buf, contentType, filename };
  } finally {
    clearTimeout(timer);
  }
}

async function postMultipart(
  path: string,
  form: FormData,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: { ...authHeaders() },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) await handleError(res, path);
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    return { text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

async function deleteJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getBaseUrl()}${path}`, {
      method: "DELETE",
      headers: { ...authHeaders(), Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) await handleError(res, path);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Types ──────────────────────────────────────────────────────────────

export interface SpeechParams {
  input: string;
  model?: "qwen3" | "chatterbox" | "kokoro";
  voice?: string;
  response_format?: "mp3" | "wav" | "opus";
  speed?: number;
  language?: string;
  exaggeration?: number;
  cfg_weight?: number;
  seed?: number;
  instruct?: string;
}

export interface SFXParams {
  prompt: string;
  negative_prompt?: string;
  duration?: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  seed?: number;
}

// ─── Endpoints ──────────────────────────────────────────────────────────

export async function health() {
  return getJson<Record<string, unknown>>("/health", 10_000);
}

export async function gpuStatus() {
  return getJson<Record<string, unknown>>("/v1/gpu/status", 10_000);
}

export async function listModels() {
  return getJson<{ models: unknown[] }>("/v1/models", 15_000);
}

export async function listVoices() {
  return getJson<Record<string, unknown>>("/v1/voices", 15_000);
}

export async function getVoice(name: string) {
  return getJson<Record<string, unknown>>(`/v1/voices/${encodeURIComponent(name)}`, 15_000);
}

export async function deleteVoice(name: string) {
  return deleteJson<Record<string, unknown>>(`/v1/voices/${encodeURIComponent(name)}`, 30_000);
}

export async function generateSpeech(params: SpeechParams) {
  return postForBytes("/v1/audio/speech", params);
}

export async function generateSfx(params: SFXParams) {
  return postForBytes("/v1/audio/sfx", params);
}

export async function transcribeUrl(
  sourceUrl: string,
  opts: { language?: string; response_format?: string; prompt?: string } = {}
) {
  const src = await fetchAudio(sourceUrl);
  const form = new FormData();
  form.append(
    "file",
    new Blob([src.bytes as unknown as BlobPart], { type: src.contentType }),
    src.filename
  );
  if (opts.language) form.append("language", opts.language);
  if (opts.response_format) form.append("response_format", opts.response_format);
  if (opts.prompt) form.append("prompt", opts.prompt);
  return postMultipart("/v1/audio/transcriptions", form);
}

export async function translateUrl(
  sourceUrl: string,
  opts: { response_format?: string; prompt?: string } = {}
) {
  const src = await fetchAudio(sourceUrl);
  const form = new FormData();
  form.append(
    "file",
    new Blob([src.bytes as unknown as BlobPart], { type: src.contentType }),
    src.filename
  );
  if (opts.response_format) form.append("response_format", opts.response_format);
  if (opts.prompt) form.append("prompt", opts.prompt);
  return postMultipart("/v1/audio/translations", form);
}

export async function cloneVoiceFromUrl(
  sourceUrl: string,
  name: string,
  opts: { transcript?: string; language?: string; gender?: string; description?: string } = {}
) {
  const src = await fetchAudio(sourceUrl);
  const form = new FormData();
  form.append(
    "file",
    new Blob([src.bytes as unknown as BlobPart], { type: src.contentType }),
    src.filename
  );
  form.append("name", name);
  if (opts.transcript) form.append("transcript", opts.transcript);
  if (opts.language) form.append("language", opts.language);
  if (opts.gender) form.append("gender", opts.gender);
  if (opts.description) form.append("description", opts.description);
  return postMultipart("/v1/voices/clone", form, 600_000);
}

// ─── Helpers for base64 payloads ────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
