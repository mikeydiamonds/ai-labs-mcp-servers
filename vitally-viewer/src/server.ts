/**
 * Vitally MCP server — read-only, streamable HTTP, global API key Basic auth.
 * 34 read tools across organizations, accounts, users, conversations, notes,
 * projects, tasks, NPS, custom objects, meetings, and surveys.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import * as v from "./vitally-client.js";

const server = new McpServer({ name: "vitally-viewer", version: "1.0.0" });

// ─── Helpers ────────────────────────────────────────────────────────────────

function structured(data: unknown) {
  const obj =
    data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : { value: data };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

const read = { readOnlyHint: true, openWorldHint: true } as const;

const listParams = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Results per page (max 100, default 100)"),
  from: z
    .string()
    .optional()
    .describe("Cursor from previous response's `next` field"),
  sortBy: z
    .enum(["createdAt", "updatedAt"])
    .optional()
    .describe("Sort order (default createdAt)"),
};

// ─── Organizations ──────────────────────────────────────────────────────────

server.registerTool(
  "list_organizations",
  {
    description: "List organizations with cursor pagination.",
    inputSchema: listParams,
    annotations: read,
  },
  async (args) => structured(await v.listOrganizations(args))
);

server.registerTool(
  "get_organization",
  {
    description: "Retrieve an organization by Vitally id or externalId.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: read,
  },
  async ({ id }) => structured(await v.getOrganization(id))
);

// ─── Accounts ───────────────────────────────────────────────────────────────

server.registerTool(
  "list_accounts",
  {
    description:
      "List accounts. Optionally scope to an organization by organizationId.",
    inputSchema: {
      organizationId: z.string().optional().describe("Scope to an organization"),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listAccounts(args))
);

server.registerTool(
  "get_account",
  {
    description: "Retrieve an account by Vitally id or externalId.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: read,
  },
  async ({ id }) => structured(await v.getAccount(id))
);

server.registerTool(
  "get_account_health_scores",
  {
    description: "Retrieve health score breakdown for an account.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: read,
  },
  async ({ id }) => structured(await v.getAccountHealthScores(id))
);

// ─── Users ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_users",
  {
    description:
      "List users. Optionally scope by accountId or organizationId.",
    inputSchema: {
      accountId: z.string().optional().describe("Scope to an account"),
      organizationId: z.string().optional().describe("Scope to an organization"),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listUsers(args))
);

server.registerTool(
  "get_user",
  {
    description: "Retrieve a user by Vitally id or externalId.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: read,
  },
  async ({ id }) => structured(await v.getUser(id))
);

server.registerTool(
  "search_users",
  {
    description:
      "Search users by email, externalId, or email domain. At least one filter required.",
    inputSchema: {
      email: z.string().optional(),
      externalId: z.string().optional(),
      emailDomain: z.string().optional().describe("e.g. 'example.com'"),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: read,
  },
  async (args) => structured(await v.searchUsers(args))
);

// ─── Conversations ──────────────────────────────────────────────────────────

server.registerTool(
  "list_conversations",
  {
    description:
      "List conversations. Optionally scope by accountId or organizationId.",
    inputSchema: {
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listConversations(args))
);

server.registerTool(
  "get_conversation",
  {
    description: "Retrieve a conversation by id.",
    inputSchema: { id: z.string() },
    annotations: read,
  },
  async ({ id }) => structured(await v.getConversation(id))
);

// ─── Notes ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_notes",
  {
    description:
      "List notes. Optionally scope by accountId or organizationId.",
    inputSchema: {
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listNotes(args))
);

server.registerTool(
  "get_note",
  {
    description: "Retrieve a note by id or externalId.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: read,
  },
  async ({ id }) => structured(await v.getNote(id))
);

server.registerTool(
  "list_note_categories",
  {
    description: "List note categories.",
    inputSchema: listParams,
    annotations: read,
  },
  async (args) => structured(await v.listNoteCategories(args))
);

// ─── Projects ───────────────────────────────────────────────────────────────

server.registerTool(
  "list_projects",
  {
    description:
      "List projects. Optionally scope by accountId or organizationId.",
    inputSchema: {
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listProjects(args))
);

server.registerTool(
  "get_project",
  {
    description: "Retrieve a project by id.",
    inputSchema: { id: z.string() },
    annotations: read,
  },
  async ({ id }) => structured(await v.getProject(id))
);

server.registerTool(
  "list_project_templates",
  {
    description: "List project templates.",
    inputSchema: listParams,
    annotations: read,
  },
  async (args) => structured(await v.listProjectTemplates(args))
);

server.registerTool(
  "list_project_categories",
  {
    description: "List project categories.",
    inputSchema: listParams,
    annotations: read,
  },
  async (args) => structured(await v.listProjectCategories(args))
);

// ─── Tasks ──────────────────────────────────────────────────────────────────

server.registerTool(
  "list_tasks",
  {
    description:
      "List tasks. Optionally scope by accountId or organizationId; filter by status.",
    inputSchema: {
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      status: z.string().optional().describe("e.g. 'open', 'completed'"),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listTasks(args))
);

server.registerTool(
  "get_task",
  {
    description: "Retrieve a task by id or externalId.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: read,
  },
  async ({ id }) => structured(await v.getTask(id))
);

server.registerTool(
  "list_task_categories",
  {
    description: "List task categories.",
    inputSchema: listParams,
    annotations: read,
  },
  async (args) => structured(await v.listTaskCategories(args))
);

// ─── NPS Responses ──────────────────────────────────────────────────────────

server.registerTool(
  "list_nps_responses",
  {
    description:
      "List NPS responses. Optionally scope by accountId or organizationId.",
    inputSchema: {
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listNpsResponses(args))
);

server.registerTool(
  "get_nps_response",
  {
    description: "Retrieve an NPS response by id.",
    inputSchema: { id: z.string() },
    annotations: read,
  },
  async ({ id }) => structured(await v.getNpsResponse(id))
);

// ─── Custom Objects ─────────────────────────────────────────────────────────

server.registerTool(
  "list_custom_objects",
  {
    description: "List custom object definitions.",
    inputSchema: listParams,
    annotations: read,
  },
  async (args) => structured(await v.listCustomObjects(args))
);

server.registerTool(
  "get_custom_object",
  {
    description: "Retrieve a custom object definition by id.",
    inputSchema: { id: z.string() },
    annotations: read,
  },
  async ({ id }) => structured(await v.getCustomObject(id))
);

server.registerTool(
  "list_custom_object_instances",
  {
    description: "List instances of a custom object.",
    inputSchema: {
      customObjectId: z.string().describe("Custom object definition id"),
      ...listParams,
    },
    annotations: read,
  },
  async ({ customObjectId, ...rest }) =>
    structured(await v.listCustomObjectInstances(customObjectId, rest))
);

server.registerTool(
  "search_custom_object_instances",
  {
    description: "Search instances of a custom object by externalId or traits.",
    inputSchema: {
      customObjectId: z.string(),
      externalId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    annotations: read,
  },
  async ({ customObjectId, ...rest }) =>
    structured(await v.searchCustomObjectInstances(customObjectId, rest))
);

// ─── Meetings ───────────────────────────────────────────────────────────────

server.registerTool(
  "list_meetings",
  {
    description:
      "List meetings. Optionally scope by accountId or organizationId.",
    inputSchema: {
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      ...listParams,
    },
    annotations: read,
  },
  async (args) => structured(await v.listMeetings(args))
);

server.registerTool(
  "get_meeting",
  {
    description: "Retrieve a meeting by id or externalId.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: read,
  },
  async ({ id }) => structured(await v.getMeeting(id))
);

server.registerTool(
  "list_meeting_transcripts",
  {
    description: "List meeting transcripts.",
    inputSchema: listParams,
    annotations: read,
  },
  async (args) => structured(await v.listMeetingTranscripts(args))
);

server.registerTool(
  "get_meeting_transcript_by_id",
  {
    description: "Retrieve a transcript by transcript id.",
    inputSchema: { id: z.string() },
    annotations: read,
  },
  async ({ id }) => structured(await v.getMeetingTranscriptById(id))
);

server.registerTool(
  "get_meeting_transcript",
  {
    description: "Retrieve the transcript attached to a meeting.",
    inputSchema: { meetingId: z.string() },
    annotations: read,
  },
  async ({ meetingId }) =>
    structured(await v.getMeetingTranscript(meetingId))
);

// ─── Custom Surveys ─────────────────────────────────────────────────────────

server.registerTool(
  "list_survey_responses",
  {
    description: "List responses for a custom survey.",
    inputSchema: {
      surveyId: z.string().describe("Survey id (UUID)"),
      ...listParams,
    },
    annotations: read,
  },
  async ({ surveyId, ...rest }) =>
    structured(await v.listSurveyResponses(surveyId, rest))
);

server.registerTool(
  "get_survey_response",
  {
    description: "Retrieve a survey response by id.",
    inputSchema: { responseId: z.string() },
    annotations: read,
  },
  async ({ responseId }) => structured(await v.getSurveyResponse(responseId))
);

server.registerTool(
  "get_survey_question",
  {
    description: "Retrieve a survey question by id.",
    inputSchema: { questionId: z.string() },
    annotations: read,
  },
  async ({ questionId }) => structured(await v.getSurveyQuestion(questionId))
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
  console.log(`Vitally MCP (read-only) server listening on 0.0.0.0:${PORT}/mcp`);
});
