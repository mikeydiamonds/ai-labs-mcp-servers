/**
 * Canny MCP server — read-only, streamable HTTP, global API key auth.
 * Follows mintmcp/zendesk-mcp conventions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  getBoard,
  listBoards,
  getPost,
  listPosts,
  getComment,
  listComments,
  getVote,
  listVotes,
  getUser,
  listUsers,
  getCategory,
  listCategories,
  getTag,
  listTags,
  listStatusChanges,
  listChangelogEntries,
  listCompanies,
  getGroup,
  listGroups,
  getIdea,
  listIdeas,
  getInsight,
  listInsights,
  listOpportunities,
} from "./canny-client.js";

const server = new McpServer({ name: "canny-readonly", version: "1.0.0" });

// ─── Helpers ────────────────────────────────────────────────────────────────

function structured(data: unknown) {
  const obj = data as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

// ─── Boards ─────────────────────────────────────────────────────────────────

server.registerTool(
  "get_board",
  {
    description: "Retrieve a Canny board by ID.",
    inputSchema: {
      id: z.string().describe("The board's unique identifier"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getBoard(id))
);

server.registerTool(
  "list_boards",
  {
    description: "List all Canny boards.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await listBoards())
);

// ─── Posts ──────────────────────────────────────────────────────────────────

server.registerTool(
  "get_post",
  {
    description: "Retrieve a Canny post by ID or by boardID + urlName.",
    inputSchema: {
      id: z.string().optional().describe("Post unique identifier"),
      boardID: z.string().optional().describe("Board ID (required when using urlName)"),
      urlName: z.string().optional().describe("Post URL name"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await getPost(args))
);

server.registerTool(
  "list_posts",
  {
    description: "List posts with filters and pagination. Use search OR sort/pagination, not both.",
    inputSchema: {
      boardID: z.string().optional().describe("Filter by board"),
      authorID: z.string().optional().describe("Filter by author"),
      companyID: z.string().optional().describe("Filter by company custom identifier"),
      tagIDs: z.array(z.string()).optional().describe("Filter by tag IDs"),
      search: z.string().optional().describe("Search query (incompatible with sort/pagination)"),
      sort: z.enum(["newest", "oldest", "relevance", "score", "statusChanged", "trending"]).optional().describe("Sort order (default: newest)"),
      status: z.string().optional().describe("Comma-separated status filter (e.g. 'open,under review')"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      skip: z.number().int().min(0).optional().describe("Pagination offset (default: 0)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listPosts(args))
);

// ─── Comments ───────────────────────────────────────────────────────────────

server.registerTool(
  "get_comment",
  {
    description: "Retrieve a Canny comment by ID.",
    inputSchema: {
      id: z.string().describe("The comment's unique identifier"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getComment(id))
);

server.registerTool(
  "list_comments",
  {
    description: "List comments with filters. Cursor-based pagination.",
    inputSchema: {
      authorID: z.string().optional().describe("Filter by comment author"),
      boardID: z.string().optional().describe("Filter by board"),
      companyID: z.string().optional().describe("Filter by company custom identifier"),
      postID: z.string().optional().describe("Filter by post"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listComments(args))
);

// ─── Votes ──────────────────────────────────────────────────────────────────

server.registerTool(
  "get_vote",
  {
    description: "Retrieve a Canny vote by ID.",
    inputSchema: {
      id: z.string().describe("The vote's unique identifier"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getVote(id))
);

server.registerTool(
  "list_votes",
  {
    description: "List votes with filters and pagination.",
    inputSchema: {
      boardID: z.string().optional().describe("Filter by board"),
      authorID: z.string().optional().describe("Filter by vote author"),
      postID: z.string().optional().describe("Filter by post"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      skip: z.number().int().min(0).optional().describe("Pagination offset (default: 0)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listVotes(args))
);

// ─── Users ──────────────────────────────────────────────────────────────────

server.registerTool(
  "get_user",
  {
    description: "Retrieve a Canny user by ID.",
    inputSchema: {
      id: z.string().describe("The user's unique identifier"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getUser(id))
);

server.registerTool(
  "list_users",
  {
    description: "List users. Cursor-based pagination.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listUsers(args))
);

// ─── Categories ─────────────────────────────────────────────────────────────

server.registerTool(
  "get_category",
  {
    description: "Retrieve a Canny category by ID.",
    inputSchema: {
      id: z.string().describe("The category's unique identifier"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getCategory(id))
);

server.registerTool(
  "list_categories",
  {
    description: "List categories, optionally filtered by board.",
    inputSchema: {
      boardID: z.string().optional().describe("Filter by board"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      skip: z.number().int().min(0).optional().describe("Pagination offset (default: 0)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listCategories(args))
);

// ─── Tags ───────────────────────────────────────────────────────────────────

server.registerTool(
  "get_tag",
  {
    description: "Retrieve a Canny tag by ID.",
    inputSchema: {
      id: z.string().describe("The tag's unique identifier"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getTag(id))
);

server.registerTool(
  "list_tags",
  {
    description: "List tags, optionally filtered by board.",
    inputSchema: {
      boardID: z.string().optional().describe("Filter by board"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      skip: z.number().int().min(0).optional().describe("Pagination offset (default: 0)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listTags(args))
);

// ─── Status Changes ────────────────────────────────────────────────────────

server.registerTool(
  "list_status_changes",
  {
    description: "List post status changes for auditing. Cursor-based pagination.",
    inputSchema: {
      boardID: z.string().optional().describe("Filter by board"),
      postID: z.string().optional().describe("Filter by post"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listStatusChanges(args))
);

// ─── Changelog Entries ─────────────────────────────────────────────────────

server.registerTool(
  "list_changelog_entries",
  {
    description: "List changelog entries with pagination.",
    inputSchema: {
      labelIDs: z.array(z.string()).optional().describe("Filter by label IDs"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      skip: z.number().int().min(0).optional().describe("Pagination offset (default: 0)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listChangelogEntries(args))
);

// ─── Companies ──────────────────────────────────────────────────────────────

server.registerTool(
  "list_companies",
  {
    description: "List companies. Cursor-based pagination.",
    inputSchema: {
      search: z.string().optional().describe("Search by company name"),
      segment: z.string().optional().describe("Filter by segment"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listCompanies(args))
);

// ─── Groups ─────────────────────────────────────────────────────────────────

server.registerTool(
  "get_group",
  {
    description: "Retrieve a Canny group by ID or urlName.",
    inputSchema: {
      id: z.string().optional().describe("The group's unique identifier"),
      urlName: z.string().optional().describe("The group's URL name"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await getGroup(args))
);

server.registerTool(
  "list_groups",
  {
    description: "List groups. Cursor-based pagination.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listGroups(args))
);

// ─── Ideas ──────────────────────────────────────────────────────────────────

server.registerTool(
  "get_idea",
  {
    description: "Retrieve a Canny idea by ID or urlName.",
    inputSchema: {
      id: z.string().optional().describe("The idea's unique identifier"),
      urlName: z.string().optional().describe("The idea's URL name"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await getIdea(args))
);

server.registerTool(
  "list_ideas",
  {
    description: "List ideas, optionally filtered by board. Cursor-based pagination.",
    inputSchema: {
      boardID: z.string().optional().describe("Filter by board"),
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listIdeas(args))
);

// ─── Insights ───────────────────────────────────────────────────────────────

server.registerTool(
  "get_insight",
  {
    description: "Retrieve a Canny insight by ID.",
    inputSchema: {
      id: z.string().describe("The insight's unique identifier"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getInsight(id))
);

server.registerTool(
  "list_insights",
  {
    description: "List insights. Cursor-based pagination.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listInsights(args))
);

// ─── Opportunities ──────────────────────────────────────────────────────────

server.registerTool(
  "list_opportunities",
  {
    description: "List opportunities with pagination.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional().describe("Results per page (default: 10)"),
      skip: z.number().int().min(0).optional().describe("Pagination offset (default: 0)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listOpportunities(args))
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
  console.log(`Canny MCP (read-only) server listening on 0.0.0.0:${PORT}/mcp`);
});
