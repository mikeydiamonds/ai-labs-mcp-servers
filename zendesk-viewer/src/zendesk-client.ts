/** Zendesk API client. Global API-token auth for read-only org-wide access. */

import { AsyncLocalStorage } from "node:async_hooks";
import { Buffer } from "node:buffer";

/** Per-request context carrying the Zendesk domain (auth is global). */
export interface RequestContext {
  zendeskDomain: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function getDomain(): string {
  const ctx = requestContext.getStore();
  const domain = ctx?.zendeskDomain || process.env.ZENDESK_DOMAIN || "";
  if (!domain) {
    throw new Error(
      "Missing ZENDESK_DOMAIN. Set it as a container env var or forward via X-MintMCP-Env-ZENDESK_DOMAIN."
    );
  }
  return domain;
}

function getAuthHeader(): string {
  const email = process.env.ZENDESK_EMAIL || "";
  const apiToken = process.env.ZENDESK_API_TOKEN || "";
  if (!email || !apiToken) {
    throw new Error(
      "Missing ZENDESK_EMAIL or ZENDESK_API_TOKEN. Both must be set as global env vars."
    );
  }
  const credentials = Buffer.from(`${email}/token:${apiToken}`).toString("base64");
  return `Basic ${credentials}`;
}

/** Default request timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ZendeskRequestOptions {
  method: "GET";
  path: string;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
}

function buildUrl(zendeskDomain: string, path: string, query?: ZendeskRequestOptions["query"]): URL {
  const url = new URL(path, `https://${zendeskDomain}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url;
}

export async function zendeskRequest<T = unknown>(opts: ZendeskRequestOptions): Promise<T> {
  const domain = getDomain();
  const url = buildUrl(domain, opts.path, opts.query);

  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
    Accept: "application/json",
  };

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
    throw new Error(`Zendesk API ${res.status}: ${truncated || res.statusText}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

// ─── Attachment fetch ───────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const MAGIC_BYTES: Record<string, Uint8Array[]> = {
  "image/jpeg": [new Uint8Array([0xff, 0xd8, 0xff])],
  "image/png": [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  "image/gif": [
    new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]),
    new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
  ],
  "image/webp": [new Uint8Array([0x52, 0x49, 0x46, 0x46])],
};

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function isZendeskAttachmentHost(hostname: string, zendeskDomain: string): boolean {
  if (hostname === zendeskDomain) return true;
  if (hostname === "zdusercontent.com") return true;
  if (hostname.endsWith(".zdusercontent.com")) return true;
  return false;
}

function startsWith(buf: Uint8Array, sig: Uint8Array): boolean {
  if (buf.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buf[i] !== sig[i]) return false;
  return true;
}

export interface AttachmentResult {
  contentType: string;
  dataBase64: string;
}

export async function fetchAttachment(contentUrl: string): Promise<AttachmentResult> {
  const domain = getDomain();

  let parsed: URL;
  try {
    parsed = new URL(contentUrl);
  } catch {
    throw new Error(`Invalid content_url: ${contentUrl}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`content_url must use https, got: ${parsed.protocol}`);
  }
  if (parsed.hostname !== domain) {
    throw new Error(
      `content_url host '${parsed.hostname}' does not match configured domain '${domain}'.`
    );
  }

  let currentUrl = parsed.toString();
  let sendAuth = true;
  let finalResponse: Response | null = null;
  const MAX_REDIRECTS = 3;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = {};
    if (sendAuth) headers["Authorization"] = getAuthHeader();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (res.status < 300 || res.status >= 400) {
      finalResponse = res;
      break;
    }

    const location = res.headers.get("location");
    if (!location) {
      throw new Error(`Redirect ${res.status} with no Location header`);
    }
    let next: URL;
    try {
      next = new URL(location, currentUrl);
    } catch {
      throw new Error(`Invalid redirect Location: ${location}`);
    }
    if (next.protocol !== "https:") {
      throw new Error(`Refusing to follow non-https redirect to ${next.href}`);
    }
    if (!isZendeskAttachmentHost(next.hostname, domain)) {
      throw new Error(
        `Refusing to follow redirect to untrusted host '${next.hostname}'. ` +
          "Zendesk attachments must redirect only to Zendesk or zdusercontent.com."
      );
    }
    if (next.hostname !== parsed.hostname) sendAuth = false;
    currentUrl = next.toString();
  }

  if (!finalResponse) {
    throw new Error(`Too many redirects (> ${MAX_REDIRECTS}) fetching attachment`);
  }
  if (!finalResponse.ok) {
    throw new Error(`Attachment fetch failed: ${finalResponse.status} ${finalResponse.statusText}`);
  }

  const contentType = (finalResponse.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error(
      `Attachment type '${contentType}' is not allowed. Supported: ${[...ALLOWED_IMAGE_TYPES].join(", ")}`
    );
  }

  const reader = finalResponse.body?.getReader();
  if (!reader) {
    throw new Error("Attachment response had no body");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_ATTACHMENT_BYTES) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new Error(
        `Attachment exceeds ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB size limit`
      );
    }
    chunks.push(value);
  }

  const body = Buffer.concat(chunks);

  const signatures = MAGIC_BYTES[contentType] ?? [];
  const bodyView = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  if (signatures.length && !signatures.some((sig) => startsWith(bodyView, sig))) {
    throw new Error(
      `File header does not match declared content type '${contentType}'. Attachment may be spoofed.`
    );
  }
  if (contentType === "image/webp") {
    const webpMarker = body.subarray(8, 12).toString("ascii");
    if (webpMarker !== "WEBP") {
      throw new Error("File header does not match declared content type 'image/webp'.");
    }
  }

  return {
    contentType,
    dataBase64: body.toString("base64"),
  };
}

// ─── Read-only convenience helpers ──────────────────────────────────────────

export async function getAttachment(id: number): Promise<unknown> {
  const res = await zendeskRequest<{ attachment: unknown }>({
    method: "GET",
    path: `/api/v2/attachments/${id}.json`,
  });
  return res.attachment;
}

export async function getTicket(id: number): Promise<unknown> {
  const res = await zendeskRequest<{ ticket: unknown }>({
    method: "GET",
    path: `/api/v2/tickets/${id}.json`,
  });
  return res.ticket;
}

export async function listTickets(params: {
  page?: number;
  sort_by?: string;
  sort_order?: "asc" | "desc";
}): Promise<unknown> {
  const perPage = 20;
  return zendeskRequest({
    method: "GET",
    path: "/api/v2/tickets.json",
    query: {
      page: params.page ?? 1,
      per_page: perPage,
      sort_by: params.sort_by ?? "created_at",
      sort_order: params.sort_order ?? "desc",
    },
  });
}

export async function getTicketComments(
  ticketId: number,
  params?: { page?: number }
): Promise<unknown> {
  const perPage = 5;
  return zendeskRequest({
    method: "GET",
    path: `/api/v2/tickets/${ticketId}/comments.json`,
    query: {
      page: params?.page ?? 1,
      per_page: perPage,
    },
  });
}

export async function searchTickets(query: string, params?: { page?: number }): Promise<unknown> {
  return zendeskRequest({
    method: "GET",
    path: "/api/v2/search.json",
    query: {
      query: `type:ticket ${query}`,
      page: params?.page ?? 1,
      per_page: 20,
    },
  });
}

// ─── Users ──────────────────────────────────────────────────────────────────

export async function getUser(id: number): Promise<unknown> {
  const res = await zendeskRequest<{ user: unknown }>({
    method: "GET",
    path: `/api/v2/users/${id}.json`,
  });
  return res.user;
}

export async function searchUsers(query: string, params?: { page?: number }): Promise<unknown> {
  return zendeskRequest({
    method: "GET",
    path: "/api/v2/users/search.json",
    query: {
      query,
      page: params?.page ?? 1,
      per_page: 20,
    },
  });
}

export async function getUserTickets(
  userId: number,
  params?: { page?: number; status?: string }
): Promise<unknown> {
  const q: Record<string, string | number | undefined> = {
    page: params?.page ?? 1,
    per_page: 20,
  };
  if (params?.status) q.status = params.status;
  return zendeskRequest({
    method: "GET",
    path: `/api/v2/users/${userId}/tickets/requested.json`,
    query: q,
  });
}
