/**
 * Gong MCP server — read-only, streamable HTTP, global API key Basic auth.
 * Follows mintmcp/zendesk-mcp conventions; auth pattern matches canny-viewer.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  listCalls,
  getCallExtensive,
  getCallTranscript,
  listUsers,
  getUser,
  getUserActivityStats,
  getInteractionStats,
  listWorkspaces,
  listScorecards,
  listTrackers,
  listTopics,
} from "./gong-client.js";

const server = new McpServer({ name: "gong-viewer", version: "1.0.0" });

// ─── Helpers ────────────────────────────────────────────────────────────────

function structured(data: unknown) {
  const obj = data as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

const isoDateTime = z.string().describe("ISO 8601 datetime, e.g. '2026-04-01T00:00:00Z'");

// ─── Calls ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_calls",
  {
    description:
      "List Gong calls in a date range. Returns call IDs, titles, participants, and basic metadata. Use cursor for pagination. For full call detail (topics, trackers, transcript), follow up with get_call_extensive or get_call_transcript.",
    inputSchema: {
      fromDateTime: isoDateTime.optional().describe("Filter calls starting at or after this time"),
      toDateTime: isoDateTime.optional().describe("Filter calls starting before this time"),
      workspaceId: z.string().optional().describe("Limit to a single workspace"),
      callIds: z.array(z.string()).optional().describe("Filter to specific call IDs"),
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listCalls(args))
);

server.registerTool(
  "get_call_extensive",
  {
    description:
      "Get rich call data: participants, topics, trackers, brief, outline, highlights, key points, public comments, and call outcome. The workhorse Gong endpoint. Filter by callIds (preferred) or date range.",
    inputSchema: {
      callIds: z.array(z.string()).optional().describe("Specific call IDs to fetch"),
      fromDateTime: isoDateTime.optional().describe("Start of date range"),
      toDateTime: isoDateTime.optional().describe("End of date range"),
      workspaceId: z.string().optional().describe("Limit to a workspace"),
      primaryUserIds: z.array(z.string()).optional().describe("Filter by primary user IDs"),
      context: z
        .enum(["None", "Basic", "Extended"])
        .optional()
        .describe("Context detail level (default Extended)"),
      includeParties: z.boolean().optional().describe("Include attendee list (default true)"),
      includeContent: z.boolean().optional().describe("Include topics/trackers/brief/outline/highlights/keyPoints (default true)"),
      includeInteraction: z.boolean().optional().describe("Include speakers/questions/stats (default false)"),
      includeCollaboration: z.boolean().optional().describe("Include public comments (default false)"),
      includeMedia: z.boolean().optional().describe("Include media URLs (default false)"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    const includeContent = args.includeContent ?? true;
    return structured(
      await getCallExtensive({
        filter: {
          callIds: args.callIds,
          fromDateTime: args.fromDateTime,
          toDateTime: args.toDateTime,
          workspaceId: args.workspaceId,
          primaryUserIds: args.primaryUserIds,
        },
        contentSelector: {
          context: args.context ?? "Extended",
          exposedFields: {
            parties: args.includeParties ?? true,
            content: includeContent
              ? {
                  topics: true,
                  trackers: true,
                  brief: true,
                  outline: true,
                  highlights: true,
                  callOutcome: true,
                  keyPoints: true,
                }
              : undefined,
            interaction: args.includeInteraction
              ? { speakers: true, questions: true, personInteractionStats: true }
              : undefined,
            collaboration: args.includeCollaboration ? { publicComments: true } : undefined,
            media: args.includeMedia ?? false,
          },
        },
        cursor: args.cursor,
      })
    );
  }
);

server.registerTool(
  "get_call_transcript",
  {
    description:
      "Get full transcripts for one or more Gong calls. Each transcript is a list of utterances with speaker IDs and timestamps. Filter by callIds (preferred) or date range. Large result sets paginate via cursor.",
    inputSchema: {
      callIds: z.array(z.string()).optional().describe("Specific call IDs to transcribe"),
      fromDateTime: isoDateTime.optional().describe("Start of date range"),
      toDateTime: isoDateTime.optional().describe("End of date range"),
      workspaceId: z.string().optional().describe("Limit to a workspace"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await getCallTranscript(args))
);

// ─── Users ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_users",
  {
    description: "List all Gong users in the company. Cursor-based pagination.",
    inputSchema: {
      cursor: z.string().optional().describe("Pagination cursor from previous response"),
      includeAvatars: z.boolean().optional().describe("Include avatar URLs (default false)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listUsers(args))
);

server.registerTool(
  "get_user",
  {
    description: "Retrieve a single Gong user by ID.",
    inputSchema: {
      id: z.string().describe("The user's unique Gong ID"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ id }) => structured(await getUser(id))
);

// ─── Stats ──────────────────────────────────────────────────────────────────

server.registerTool(
  "get_user_activity_stats",
  {
    description:
      "Daily activity stats per user: calls held, conversations, time on calls, etc. Required: fromDateTime, toDateTime.",
    inputSchema: {
      fromDateTime: isoDateTime.describe("Start of date range"),
      toDateTime: isoDateTime.describe("End of date range"),
      userIds: z.array(z.string()).optional().describe("Filter to specific users"),
      workspaceId: z.string().optional().describe("Limit to a workspace"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await getUserActivityStats(args))
);

server.registerTool(
  "get_interaction_stats",
  {
    description:
      "Interaction stats: talk-listen ratio, longest monologue, longest customer story, patience, question rate. Useful for coaching and call quality analysis. Required: fromDateTime, toDateTime.",
    inputSchema: {
      fromDateTime: isoDateTime.describe("Start of date range"),
      toDateTime: isoDateTime.describe("End of date range"),
      userIds: z.array(z.string()).optional().describe("Filter to specific users"),
      workspaceId: z.string().optional().describe("Limit to a workspace"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await getInteractionStats(args))
);

// ─── Workspaces & Settings ──────────────────────────────────────────────────

server.registerTool(
  "list_workspaces",
  {
    description: "List all Gong workspaces in the company.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await listWorkspaces())
);

server.registerTool(
  "list_scorecards",
  {
    description: "List call scorecards configured for the company. Optionally filter by workspace.",
    inputSchema: {
      workspaceId: z.string().optional().describe("Filter by workspace"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listScorecards(args))
);

server.registerTool(
  "list_trackers",
  {
    description: "List smart trackers (keyword + AI patterns) configured for the company. Optionally filter by workspace.",
    inputSchema: {
      workspaceId: z.string().optional().describe("Filter by workspace"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listTrackers(args))
);

server.registerTool(
  "list_topics",
  {
    description: "List call topics configured for the company. Optionally filter by workspace.",
    inputSchema: {
      workspaceId: z.string().optional().describe("Filter by workspace"),
      cursor: z.string().optional().describe("Pagination cursor"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listTopics(args))
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
  console.log(`Gong MCP (read-only) server listening on 0.0.0.0:${PORT}/mcp`);
});
