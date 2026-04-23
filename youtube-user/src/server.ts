/**
 * YouTube MCP server — YouTube Data API v3 via per-user OAuth passthrough.
 * Streamable HTTP transport, /mcp endpoint, /healthz.
 *
 * MintMCP runs the Google OAuth flow per user and forwards the access
 * token as `Authorization: Bearer <token>` on each request. We stash
 * it in AsyncLocalStorage so the YouTube client can pick it up
 * without threading it through every tool handler.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  requestContext,
  getMyChannel,
  uploadVideo,
  updateVideo,
  deleteVideo,
  getVideo,
  listMyVideos,
  searchMyVideos,
  setThumbnail,
  listPlaylists,
  listPlaylistItems,
  addToPlaylist,
  removeFromPlaylist,
  createPlaylist,
} from "./youtube-client.js";

const server = new McpServer(
  { name: "youtube-user", version: "1.0.0" },
  {
    instructions: [
      "YouTube MCP server with per-user Google OAuth.",
      "All tools operate on the channel selected by the user during the OAuth consent flow.",
      "For Brand Accounts (e.g. DNSFilter): the user must have been granted Manager/Editor access to that channel in YouTube Studio → Settings → Permissions and must pick that channel at consent time.",
    ].join("\n"),
  }
);

function structured(data: unknown) {
  const obj = (data && typeof data === "object" ? data : { result: data }) as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

// ─── Channels ───────────────────────────────────────────────────────────────

server.registerTool(
  "get_my_channel",
  {
    description: "Get info for the authenticated YouTube channel (ID, stats, uploads playlist).",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await getMyChannel())
);

// ─── Videos ─────────────────────────────────────────────────────────────────

server.registerTool(
  "upload_video",
  {
    description:
      "Upload a video to the authenticated YouTube channel. Fetches the source from sourceUrl, does a resumable upload, optionally sets a thumbnail and adds to a playlist. For scheduled release, set privacyStatus='private' and supply publishAt (ISO 8601).",
    inputSchema: {
      sourceUrl: z.string().describe("Public URL of the video file to upload (e.g. Vizard CDN mp4)."),
      title: z.string().describe("Video title."),
      description: z.string().optional().describe("Video description."),
      tags: z.array(z.string()).optional().describe("Tags."),
      categoryId: z.string().optional().describe("YouTube category ID. Default '28' (Science & Technology)."),
      privacyStatus: z.enum(["private", "public", "unlisted"]).optional().describe("Default 'private'."),
      publishAt: z.string().optional().describe("ISO 8601 UTC timestamp for scheduled release. Requires privacyStatus='private'."),
      madeForKids: z.boolean().optional().describe("selfDeclaredMadeForKids flag."),
      thumbnailUrl: z.string().optional().describe("Optional thumbnail image URL to set after upload."),
      playlistId: z.string().optional().describe("Optional playlist ID to add the uploaded video to."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await uploadVideo(args))
);

server.registerTool(
  "update_video",
  {
    description: "Update title/description/tags/category/privacy/publishAt for an existing video.",
    inputSchema: {
      id: z.string().describe("Video ID."),
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      categoryId: z.string().optional(),
      privacyStatus: z.enum(["private", "public", "unlisted"]).optional(),
      publishAt: z.string().optional(),
      madeForKids: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await updateVideo(args))
);

server.registerTool(
  "delete_video",
  {
    description: "Delete a video permanently.",
    inputSchema: { id: z.string().describe("Video ID.") },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ id }) => structured(await deleteVideo(id))
);

server.registerTool(
  "get_video",
  {
    description: "Get full metadata for a video by ID (snippet, status, content details, statistics).",
    inputSchema: { id: z.string().describe("Video ID.") },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getVideo(id))
);

server.registerTool(
  "list_my_videos",
  {
    description: "List recent videos on the authenticated channel (most recent first).",
    inputSchema: {
      maxResults: z.number().int().min(1).max(50).optional().describe("Default 25."),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listMyVideos(args))
);

server.registerTool(
  "search_my_videos",
  {
    description: "Search videos on the authenticated channel by text query.",
    inputSchema: {
      q: z.string().describe("Search query."),
      maxResults: z.number().int().min(1).max(50).optional().describe("Default 25."),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await searchMyVideos(args))
);

// ─── Thumbnails ─────────────────────────────────────────────────────────────

server.registerTool(
  "set_thumbnail",
  {
    description: "Set a custom thumbnail for a video. Fetches the image from sourceUrl and uploads.",
    inputSchema: {
      videoId: z.string(),
      sourceUrl: z.string().describe("Public URL of the thumbnail image (jpg/png, ≤2MB)."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ videoId, sourceUrl }) => structured(await setThumbnail(videoId, sourceUrl))
);

// ─── Playlists ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_playlists",
  {
    description: "List playlists owned by the authenticated channel.",
    inputSchema: {
      maxResults: z.number().int().min(1).max(50).optional().describe("Default 50."),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listPlaylists(args))
);

server.registerTool(
  "list_playlist_items",
  {
    description: "List videos in a playlist.",
    inputSchema: {
      playlistId: z.string(),
      maxResults: z.number().int().min(1).max(50).optional().describe("Default 50."),
      pageToken: z.string().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listPlaylistItems(args))
);

server.registerTool(
  "add_to_playlist",
  {
    description: "Add a video to a playlist.",
    inputSchema: {
      playlistId: z.string(),
      videoId: z.string(),
      position: z.number().int().min(0).optional().describe("Zero-based insert position. Omit to append."),
      note: z.string().optional(),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await addToPlaylist(args))
);

server.registerTool(
  "remove_from_playlist",
  {
    description: "Remove a video from a playlist by its playlistItem ID (not video ID).",
    inputSchema: {
      playlistItemId: z.string().describe("The playlistItem id (from list_playlist_items), NOT the video ID."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async ({ playlistItemId }) => structured(await removeFromPlaylist(playlistItemId))
);

server.registerTool(
  "create_playlist",
  {
    description: "Create a new playlist on the authenticated channel.",
    inputSchema: {
      title: z.string(),
      description: z.string().optional(),
      privacyStatus: z.enum(["private", "public", "unlisted"]).optional().describe("Default 'private'."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await createPlaylist(args))
);

// ─── HTTP transport ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const accessToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  try {
    res.on("close", () => transport.close());
    await requestContext.run({ accessToken }, async () => {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  } catch (err) {
    console.error("MCP request error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const PORT = parseInt(process.env.PORT || "8000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`YouTube (per-user) MCP server listening on 0.0.0.0:${PORT}/mcp`);
});
