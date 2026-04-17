/**
 * Vitally MCP server — streamable HTTP, global API key auth.
 * Follows mintmcp/zendesk-mcp and canny conventions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import * as v from "./vitally-client.js";

const server = new McpServer({ name: "vitally", version: "1.0.0" });

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
const write = { readOnlyHint: false, openWorldHint: true } as const;

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

server.registerTool(
  "create_organization",
  {
    description: "Create an organization.",
    inputSchema: {
      externalId: z.string().describe("Your system's unique id"),
      name: z.string().describe("Organization name"),
      paymentMethod: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional().describe("Custom traits"),
    },
    annotations: write,
  },
  async (args) => structured(await v.createOrganization(args))
);

server.registerTool(
  "update_organization",
  {
    description: "Update an organization by id or externalId.",
    inputSchema: {
      id: z.string().describe("Vitally id or externalId"),
      name: z.string().optional(),
      paymentMethod: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateOrganization(id, body))
);

server.registerTool(
  "delete_organization",
  {
    description: "Delete an organization. Destructive.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteOrganization(id))
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

server.registerTool(
  "create_account",
  {
    description: "Create an account.",
    inputSchema: {
      externalId: z.string().describe("Your system's unique id"),
      name: z.string().describe("Account name"),
      organizationId: z.string().optional(),
      paymentMethod: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createAccount(args))
);

server.registerTool(
  "update_account",
  {
    description: "Update an account by id or externalId.",
    inputSchema: {
      id: z.string().describe("Vitally id or externalId"),
      name: z.string().optional(),
      paymentMethod: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateAccount(id, body))
);

server.registerTool(
  "delete_account",
  {
    description: "Delete an account. Destructive.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteAccount(id))
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

server.registerTool(
  "create_user",
  {
    description: "Create a user.",
    inputSchema: {
      externalId: z.string().describe("Your system's unique id"),
      email: z.string().optional(),
      name: z.string().optional(),
      avatar: z.string().optional(),
      accountIds: z.array(z.string()).optional(),
      organizationIds: z.array(z.string()).optional(),
      unsubscribedFromConversations: z.boolean().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createUser(args))
);

server.registerTool(
  "update_user",
  {
    description: "Update a user by id or externalId.",
    inputSchema: {
      id: z.string().describe("Vitally id or externalId"),
      email: z.string().optional(),
      name: z.string().optional(),
      avatar: z.string().optional(),
      accountIds: z.array(z.string()).optional(),
      organizationIds: z.array(z.string()).optional(),
      unsubscribedFromConversations: z.boolean().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateUser(id, body))
);

server.registerTool(
  "delete_user",
  {
    description: "Delete a user. Destructive.",
    inputSchema: { id: z.string().describe("Vitally id or externalId") },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteUser(id))
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

server.registerTool(
  "create_conversation",
  {
    description: "Create a conversation.",
    inputSchema: {
      externalId: z.string().optional(),
      type: z.string().optional().describe("e.g. 'email', 'slack', 'call'"),
      subject: z.string().optional(),
      from: z.unknown().optional().describe("Sender object (userId/email/name)"),
      to: z.array(z.unknown()).optional().describe("Recipient objects"),
      message: z.string().optional().describe("Full conversation body"),
      messages: z.array(z.unknown()).optional().describe("Threaded messages"),
      dealArr: z.number().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createConversation(args))
);

server.registerTool(
  "update_conversation",
  {
    description: "Update a conversation by id.",
    inputSchema: {
      id: z.string(),
      subject: z.string().optional(),
      message: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateConversation(id, body))
);

server.registerTool(
  "delete_conversation",
  {
    description: "Delete a conversation. Destructive.",
    inputSchema: { id: z.string() },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteConversation(id))
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
  "create_note",
  {
    description: "Create a note on an account or organization.",
    inputSchema: {
      externalId: z.string().optional(),
      subject: z.string().optional(),
      note: z.string().describe("Note content (HTML or plain text)"),
      authorId: z.string().optional().describe("Vitally user id of author"),
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      noteDate: z.string().optional().describe("ISO-8601 timestamp"),
      categoryId: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createNote(args))
);

server.registerTool(
  "update_note",
  {
    description: "Update a note by id or externalId.",
    inputSchema: {
      id: z.string(),
      subject: z.string().optional(),
      note: z.string().optional(),
      categoryId: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateNote(id, body))
);

server.registerTool(
  "delete_note",
  {
    description: "Delete a note. Destructive.",
    inputSchema: { id: z.string() },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteNote(id))
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
  "create_project",
  {
    description: "Create a project from a template.",
    inputSchema: {
      templateId: z.string().describe("Project template id"),
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      name: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      ownerId: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createProject(args))
);

server.registerTool(
  "update_project",
  {
    description: "Update a project by id.",
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      ownerId: z.string().optional(),
      status: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateProject(id, body))
);

server.registerTool(
  "delete_project",
  {
    description: "Delete a project. Destructive.",
    inputSchema: { id: z.string() },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteProject(id))
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
  "create_task",
  {
    description: "Create a task.",
    inputSchema: {
      externalId: z.string().optional(),
      name: z.string().describe("Task title"),
      description: z.string().optional(),
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      assignedToId: z.string().optional().describe("Vitally user id"),
      dueDate: z.string().optional().describe("ISO-8601 date"),
      completedAt: z.string().optional(),
      completedById: z.string().optional(),
      categoryId: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createTask(args))
);

server.registerTool(
  "update_task",
  {
    description: "Update a task by id or externalId.",
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      assignedToId: z.string().optional(),
      dueDate: z.string().optional(),
      completedAt: z.string().optional(),
      completedById: z.string().optional(),
      categoryId: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateTask(id, body))
);

server.registerTool(
  "delete_task",
  {
    description: "Delete a task. Destructive.",
    inputSchema: { id: z.string() },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteTask(id))
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

server.registerTool(
  "create_nps_response",
  {
    description: "Create an NPS response.",
    inputSchema: {
      externalId: z.string().optional(),
      score: z.number().int().min(0).max(10).describe("0-10"),
      feedback: z.string().optional(),
      userId: z.string().optional().describe("Vitally user id or externalId"),
      respondedAt: z.string().optional().describe("ISO-8601 timestamp"),
    },
    annotations: write,
  },
  async (args) => structured(await v.createNpsResponse(args))
);

server.registerTool(
  "update_nps_response",
  {
    description: "Update an NPS response by id.",
    inputSchema: {
      id: z.string(),
      score: z.number().int().min(0).max(10).optional(),
      feedback: z.string().optional(),
      respondedAt: z.string().optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateNpsResponse(id, body))
);

server.registerTool(
  "delete_nps_response",
  {
    description: "Delete an NPS response. Destructive.",
    inputSchema: { id: z.string() },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteNpsResponse(id))
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
  "create_custom_object",
  {
    description: "Create a custom object definition.",
    inputSchema: {
      name: z.string(),
      organizationId: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createCustomObject(args))
);

server.registerTool(
  "update_custom_object",
  {
    description: "Update a custom object definition.",
    inputSchema: {
      id: z.string(),
      name: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateCustomObject(id, body))
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

server.registerTool(
  "create_custom_object_instance",
  {
    description: "Create a custom object instance.",
    inputSchema: {
      customObjectId: z.string(),
      externalId: z.string().optional(),
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ customObjectId, ...body }) =>
    structured(await v.createCustomObjectInstance(customObjectId, body))
);

server.registerTool(
  "update_custom_object_instance",
  {
    description: "Update a custom object instance.",
    inputSchema: {
      customObjectId: z.string(),
      instanceId: z.string(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ customObjectId, instanceId, ...body }) =>
    structured(
      await v.updateCustomObjectInstance(customObjectId, instanceId, body)
    )
);

server.registerTool(
  "delete_custom_object_instance",
  {
    description: "Delete a custom object instance. Destructive.",
    inputSchema: {
      customObjectId: z.string(),
      instanceId: z.string(),
    },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ customObjectId, instanceId }) =>
    structured(await v.deleteCustomObjectInstance(customObjectId, instanceId))
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
  "create_meeting",
  {
    description: "Create a meeting.",
    inputSchema: {
      externalId: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      location: z.string().optional(),
      source: z.string().optional().describe("e.g. 'zoom', 'gmeet'"),
      type: z.string().optional(),
      startDateTime: z.string().describe("ISO-8601"),
      endDateTime: z.string().describe("ISO-8601"),
      userId: z.string().optional().describe("External user id"),
      vitallyUserId: z.string().optional(),
      accountId: z.string().optional(),
      organizationId: z.string().optional(),
      responseStatus: z.string().optional(),
      participants: z.array(z.unknown()).optional(),
      summary: z.string().optional(),
      keyPoints: z.array(z.string()).optional(),
      riskAssessment: z.unknown().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async (args) => structured(await v.createMeeting(args))
);

server.registerTool(
  "update_meeting",
  {
    description: "Update a meeting by id or externalId.",
    inputSchema: {
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      startDateTime: z.string().optional(),
      endDateTime: z.string().optional(),
      summary: z.string().optional(),
      keyPoints: z.array(z.string()).optional(),
      riskAssessment: z.unknown().optional(),
      traits: z.record(z.string(), z.unknown()).optional(),
    },
    annotations: write,
  },
  async ({ id, ...body }) => structured(await v.updateMeeting(id, body))
);

server.registerTool(
  "delete_meeting",
  {
    description: "Delete a meeting. Destructive.",
    inputSchema: { id: z.string() },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ id }) => structured(await v.deleteMeeting(id))
);

server.registerTool(
  "add_meeting_participant",
  {
    description: "Add a participant to a meeting.",
    inputSchema: {
      meetingId: z.string(),
      userId: z.string().optional(),
      vitallyUserId: z.string().optional(),
      email: z.string().optional(),
      name: z.string().optional(),
      responseStatus: z.string().optional(),
    },
    annotations: write,
  },
  async ({ meetingId, ...body }) =>
    structured(await v.addMeetingParticipant(meetingId, body))
);

server.registerTool(
  "remove_meeting_participant",
  {
    description: "Remove a participant from a meeting. Destructive.",
    inputSchema: {
      meetingId: z.string(),
      participantId: z.string(),
    },
    annotations: { ...write, destructiveHint: true },
  },
  async ({ meetingId, participantId }) =>
    structured(await v.removeMeetingParticipant(meetingId, participantId))
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

server.registerTool(
  "create_meeting_transcript",
  {
    description: "Create or replace a meeting's transcript.",
    inputSchema: {
      meetingId: z.string(),
      transcript: z
        .unknown()
        .describe("Transcript payload (string, segments array, or Vitally-shaped object)"),
    },
    annotations: write,
  },
  async ({ meetingId, transcript }) =>
    structured(
      await v.createMeetingTranscript(meetingId, transcript as Record<string, unknown>)
    )
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
  console.log(`Vitally MCP server listening on 0.0.0.0:${PORT}/mcp`);
});
