/**
 * YouTube Data API v3 client. Per-user OAuth passthrough.
 *
 * The caller's access token arrives on each request via the HTTP
 * `Authorization: Bearer <token>` header. The transport handler in
 * server.ts stores it in AsyncLocalStorage; every API call reads it
 * back out of the request context.
 *
 * MintMCP runs the Google OAuth flow for each user and forwards the
 * resulting access token. No refresh logic here — MintMCP handles
 * refresh and reissues the header on expiry.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";
const DEFAULT_TIMEOUT_MS = 120_000;

interface RequestContext {
  accessToken: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

function getAccessToken(): string {
  const ctx = requestContext.getStore();
  if (!ctx || !ctx.accessToken) {
    throw new Error(
      "No access token. Connect the connector in MintMCP and complete the Google OAuth flow."
    );
  }
  return ctx.accessToken;
}

type QueryParams = Record<string, string | number | boolean | string[] | undefined>;

function buildQuery(params: QueryParams): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v.join(","))}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

async function apiRequest<T = unknown>(
  method: string,
  path: string,
  opts: { query?: QueryParams; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const token = getAccessToken();
  const url = `${API_BASE}${path}${buildQuery(opts.query ?? {})}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube API ${res.status} ${method} ${path}: ${text.slice(0, 600)}`);
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

// ─── Channels ───────────────────────────────────────────────────────────────

export async function getMyChannel() {
  return apiRequest("GET", "/channels", {
    query: { part: "snippet,contentDetails,statistics,status", mine: true },
  });
}

// ─── Videos ─────────────────────────────────────────────────────────────────

export interface UploadVideoParams {
  sourceUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  publishAt?: string; // ISO 8601
  madeForKids?: boolean;
  thumbnailUrl?: string;
  playlistId?: string;
}

export async function uploadVideo(params: UploadVideoParams) {
  const token = getAccessToken();

  // 1. Fetch the source bytes
  const srcRes = await fetch(params.sourceUrl);
  if (!srcRes.ok) {
    throw new Error(`Source fetch ${srcRes.status} for ${params.sourceUrl}`);
  }
  const contentType = srcRes.headers.get("content-type") || "video/mp4";
  const buf = Buffer.from(await srcRes.arrayBuffer());

  // 2. Initiate resumable upload session
  const metadata: Record<string, unknown> = {
    snippet: {
      title: params.title,
      description: params.description ?? "",
      tags: params.tags ?? [],
      categoryId: params.categoryId ?? "28",
    },
    status: {
      privacyStatus: params.privacyStatus ?? "private",
      ...(params.publishAt ? { publishAt: params.publishAt } : {}),
      ...(params.madeForKids !== undefined ? { selfDeclaredMadeForKids: params.madeForKids } : {}),
    },
  };

  const initUrl = `${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`;
  const initRes = await fetch(initUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Upload-Content-Length": String(buf.length),
      "X-Upload-Content-Type": contentType,
    },
    body: JSON.stringify(metadata),
  });
  if (!initRes.ok) {
    const text = await initRes.text().catch(() => "");
    throw new Error(`Resumable init ${initRes.status}: ${text.slice(0, 600)}`);
  }
  const uploadSession = initRes.headers.get("location");
  if (!uploadSession) {
    throw new Error("Resumable init succeeded but no Location header returned");
  }

  // 3. PUT the bytes
  const putRes = await fetch(uploadSession, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(buf.length),
    },
    body: buf,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`Resumable PUT ${putRes.status}: ${text.slice(0, 600)}`);
  }
  const video = (await putRes.json()) as { id: string };

  // 4. Optional follow-ups
  if (params.thumbnailUrl) {
    await setThumbnail(video.id, params.thumbnailUrl);
  }
  if (params.playlistId) {
    await addToPlaylist({ playlistId: params.playlistId, videoId: video.id });
  }
  return video;
}

export interface UpdateVideoParams {
  id: string;
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: "private" | "public" | "unlisted";
  publishAt?: string;
  madeForKids?: boolean;
}

export async function updateVideo(params: UpdateVideoParams) {
  const parts: string[] = [];
  const body: Record<string, unknown> = { id: params.id };
  const snippetFields = ["title", "description", "tags", "categoryId"] as const;
  const hasSnippet = snippetFields.some((f) => (params as unknown as Record<string, unknown>)[f] !== undefined);
  if (hasSnippet) {
    // snippet PUT requires ALL required snippet fields, so caller must supply title+categoryId
    parts.push("snippet");
    const snippet: Record<string, unknown> = {};
    if (params.title !== undefined) snippet.title = params.title;
    if (params.description !== undefined) snippet.description = params.description;
    if (params.tags !== undefined) snippet.tags = params.tags;
    if (params.categoryId !== undefined) snippet.categoryId = params.categoryId;
    body.snippet = snippet;
  }
  const statusFields = ["privacyStatus", "publishAt", "madeForKids"] as const;
  const hasStatus = statusFields.some((f) => (params as unknown as Record<string, unknown>)[f] !== undefined);
  if (hasStatus) {
    parts.push("status");
    const status: Record<string, unknown> = {};
    if (params.privacyStatus !== undefined) status.privacyStatus = params.privacyStatus;
    if (params.publishAt !== undefined) status.publishAt = params.publishAt;
    if (params.madeForKids !== undefined) status.selfDeclaredMadeForKids = params.madeForKids;
    body.status = status;
  }
  if (parts.length === 0) {
    throw new Error("updateVideo: at least one field must be provided");
  }
  return apiRequest("PUT", "/videos", { query: { part: parts }, body });
}

export async function deleteVideo(id: string) {
  return apiRequest("DELETE", "/videos", { query: { id } });
}

export async function getVideo(id: string) {
  return apiRequest("GET", "/videos", {
    query: { part: "snippet,status,contentDetails,statistics", id },
  });
}

export async function listMyVideos(params: { maxResults?: number; pageToken?: string } = {}) {
  // Mine via search.list(forMine=true)
  return apiRequest("GET", "/search", {
    query: {
      part: "snippet",
      forMine: true,
      type: "video",
      maxResults: params.maxResults ?? 25,
      pageToken: params.pageToken,
      order: "date",
    },
  });
}

export async function searchMyVideos(params: { q: string; maxResults?: number; pageToken?: string }) {
  return apiRequest("GET", "/search", {
    query: {
      part: "snippet",
      forMine: true,
      type: "video",
      q: params.q,
      maxResults: params.maxResults ?? 25,
      pageToken: params.pageToken,
    },
  });
}

// ─── Thumbnails ─────────────────────────────────────────────────────────────

export async function setThumbnail(videoId: string, sourceUrl: string) {
  const token = getAccessToken();
  const res = await fetch(sourceUrl);
  if (!res.ok) throw new Error(`Thumbnail fetch ${res.status} for ${sourceUrl}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  const url = `${UPLOAD_BASE}/thumbnails/set?videoId=${encodeURIComponent(videoId)}`;
  const putRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "Content-Length": String(buf.length),
    },
    body: buf,
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`Thumbnail upload ${putRes.status}: ${text.slice(0, 400)}`);
  }
  return putRes.json();
}

// ─── Playlists ──────────────────────────────────────────────────────────────

export async function listPlaylists(params: { maxResults?: number; pageToken?: string } = {}) {
  return apiRequest("GET", "/playlists", {
    query: {
      part: "snippet,contentDetails",
      mine: true,
      maxResults: params.maxResults ?? 50,
      pageToken: params.pageToken,
    },
  });
}

export async function listPlaylistItems(params: {
  playlistId: string;
  maxResults?: number;
  pageToken?: string;
}) {
  return apiRequest("GET", "/playlistItems", {
    query: {
      part: "snippet,contentDetails",
      playlistId: params.playlistId,
      maxResults: params.maxResults ?? 50,
      pageToken: params.pageToken,
    },
  });
}

export interface AddToPlaylistParams {
  playlistId: string;
  videoId: string;
  position?: number;
  note?: string;
}

export async function addToPlaylist(params: AddToPlaylistParams) {
  const body: Record<string, unknown> = {
    snippet: {
      playlistId: params.playlistId,
      resourceId: { kind: "youtube#video", videoId: params.videoId },
      ...(params.position !== undefined ? { position: params.position } : {}),
    },
  };
  if (params.note) {
    (body as Record<string, Record<string, unknown>>).contentDetails = { note: params.note };
  }
  const parts = params.note ? "snippet,contentDetails" : "snippet";
  return apiRequest("POST", "/playlistItems", { query: { part: parts }, body });
}

export async function removeFromPlaylist(playlistItemId: string) {
  return apiRequest("DELETE", "/playlistItems", { query: { id: playlistItemId } });
}

export interface CreatePlaylistParams {
  title: string;
  description?: string;
  privacyStatus?: "private" | "public" | "unlisted";
}

export async function createPlaylist(params: CreatePlaylistParams) {
  return apiRequest("POST", "/playlists", {
    query: { part: "snippet,status" },
    body: {
      snippet: {
        title: params.title,
        description: params.description ?? "",
      },
      status: { privacyStatus: params.privacyStatus ?? "private" },
    },
  });
}
