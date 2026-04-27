/**
 * Reddit MCP server — read-only, streamable HTTP, global script-app OAuth.
 * Follows mintmcp/zendesk-mcp conventions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  listNew,
  listComments,
  search,
  getThread,
  getUserAbout,
} from "./reddit-client.js";

const server = new McpServer({ name: "reddit-readonly", version: "1.0.0" });

function structured(data: unknown) {
  // MCP requires structuredContent to be a record (object), not an array or primitive.
  // Reddit's /comments/{id} endpoint returns an array [post_listing, comments_listing].
  let obj: Record<string, unknown>;
  if (Array.isArray(data)) {
    obj = { items: data };
  } else if (typeof data === "object" && data !== null) {
    obj = data as Record<string, unknown>;
  } else {
    obj = { result: data };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

// ─── Listings ───────────────────────────────────────────────────────────────

server.registerTool(
  "reddit_list_new",
  {
    description:
      "List the newest posts from a subreddit (accepts any subreddit name, including 'all' or 'popular'). Returns Reddit's standard Listing payload.",
    inputSchema: {
      subreddit: z.string().describe("Subreddit name without the r/ prefix (e.g. 'sysadmin', 'all')"),
      limit: z.number().int().min(1).max(100).optional().describe("Max posts to return (default 25)"),
      after: z.string().optional().describe("Pagination cursor (Reddit fullname, e.g. 't3_abc123')"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listNew(args))
);

server.registerTool(
  "reddit_list_comments",
  {
    description:
      "List the newest comments from a subreddit (accepts any subreddit name). Returns Reddit's standard Listing payload.",
    inputSchema: {
      subreddit: z.string().describe("Subreddit name without the r/ prefix"),
      limit: z.number().int().min(1).max(100).optional().describe("Max comments to return (default 25)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listComments(args))
);

// ─── Search ─────────────────────────────────────────────────────────────────

server.registerTool(
  "reddit_search",
  {
    description:
      "Search Reddit site-wide or within a subreddit. Supports Reddit's full search query syntax.",
    inputSchema: {
      query: z.string().describe("Search query"),
      subreddit: z.string().optional().describe("Restrict to a subreddit (omit for site-wide)"),
      sort: z
        .enum(["relevance", "hot", "top", "new", "comments"])
        .optional()
        .describe("Sort order (default: relevance)"),
      time: z
        .enum(["hour", "day", "week", "month", "year", "all"])
        .optional()
        .describe("Time window (default: all)"),
      limit: z.number().int().min(1).max(100).optional().describe("Max results (default 25)"),
      after: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await search(args))
);

// ─── Thread ─────────────────────────────────────────────────────────────────

server.registerTool(
  "reddit_get_thread",
  {
    description:
      "Fetch a thread's post and comment tree by thread ID. Use the id segment from reddit.com/r/{sub}/comments/{id}/ (e.g. '1abcxyz'). Subreddit is optional but recommended for lower-latency routing.",
    inputSchema: {
      thread_id: z
        .string()
        .describe("Thread ID, e.g. '1abcxyz' (the segment after /comments/ in a Reddit URL)"),
      subreddit: z.string().optional().describe("Subreddit name (optional, for routing)"),
      limit: z.number().int().min(1).max(500).optional().describe("Max comments (default 200)"),
      sort: z
        .enum(["confidence", "top", "new", "controversial", "old", "random", "qa"])
        .optional()
        .describe("Comment sort order (default: confidence)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await getThread(args))
);

// ─── User ───────────────────────────────────────────────────────────────────

server.registerTool(
  "reddit_get_user",
  {
    description: "Get a Reddit user's public profile (karma, account age, verified status, etc).",
    inputSchema: {
      username: z.string().describe("Reddit username without the u/ prefix"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ username }) => structured(await getUserAbout(username))
);

// ─── HTTP transport ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
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
  console.log(`Reddit MCP (read-only) server listening on 0.0.0.0:${PORT}/mcp`);
});
