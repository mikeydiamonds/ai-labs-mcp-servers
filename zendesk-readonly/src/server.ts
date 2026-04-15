/**
 * Zendesk MCP server — read-only, global API-token auth.
 * For org-wide read access to Zendesk tickets without per-user credentials.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  requestContext,
  getTicket,
  listTickets,
  getTicketComments,
  searchTickets,
  getAttachment,
  fetchAttachment,
} from "./zendesk-client.js";

const server = new McpServer({ name: "zendesk-readonly", version: "1.0.0" });

// ─── Output shaping ──────────────────────────────────────────────────────────

function shapeTicketSummary(t: any) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    priority: t.priority ?? null,
    type: t.type ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    requester_id: t.requester_id,
    assignee_id: t.assignee_id ?? null,
    group_id: t.group_id ?? null,
    tags: t.tags ?? [],
    via_channel: t.via?.channel ?? null,
  };
}

function shapeTicketDetail(t: any) {
  return {
    ...shapeTicketSummary(t),
    description: t.description ?? null,
    organization_id: t.organization_id ?? null,
    submitter_id: t.submitter_id ?? null,
    due_at: t.due_at ?? null,
    problem_id: t.problem_id ?? null,
    has_incidents: t.has_incidents ?? false,
    is_public: t.is_public ?? true,
    satisfaction_rating: t.satisfaction_rating?.score ?? null,
    custom_fields: (t.custom_fields ?? []).filter((f: any) => f.value != null),
    collaborator_ids: t.collaborator_ids ?? [],
    brand_id: t.brand_id ?? null,
  };
}

function shapeComment(c: any) {
  return {
    id: c.id,
    author_id: c.author_id,
    body: c.body ?? c.plain_body ?? "",
    public: c.public ?? true,
    created_at: c.created_at,
    attachments: (c.attachments ?? []).map((a: any) => ({
      id: a.id,
      file_name: a.file_name,
      content_type: a.content_type,
      size: a.size,
    })),
  };
}

function structured(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

// ─── Reusable schema fragments ────────────────────────────────────────────────

const TicketSummaryShape = {
  id: z.number(),
  subject: z.string(),
  status: z.string(),
  priority: z.string().nullable(),
  type: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  requester_id: z.number(),
  assignee_id: z.number().nullable(),
  group_id: z.number().nullable(),
  tags: z.array(z.string()),
  via_channel: z.string().nullable(),
};

const CustomFieldSchema = z.object({ id: z.number(), value: z.unknown() });

const TicketDetailShape = {
  ...TicketSummaryShape,
  description: z.string().nullable(),
  organization_id: z.number().nullable(),
  submitter_id: z.number().nullable(),
  due_at: z.string().nullable(),
  problem_id: z.number().nullable(),
  has_incidents: z.boolean(),
  is_public: z.boolean(),
  satisfaction_rating: z.string().nullable(),
  custom_fields: z.array(CustomFieldSchema),
  collaborator_ids: z.array(z.number()),
  brand_id: z.number().nullable(),
};

const AttachmentSchema = z.object({
  id: z.number(),
  file_name: z.string(),
  content_type: z.string(),
  size: z.number(),
});

const CommentShape = {
  id: z.number(),
  author_id: z.number(),
  body: z.string(),
  public: z.boolean(),
  created_at: z.string(),
  attachments: z.array(AttachmentSchema),
};

const PaginationShape = {
  count: z.number(),
  next_page: z.string().nullable(),
  previous_page: z.string().nullable(),
};

// ─── Read-only tools ────────────────────────────────────────────────────────

server.registerTool(
  "get_ticket",
  {
    description:
      "Retrieve a Zendesk ticket by its ID. Returns full detail including description and custom fields.",
    inputSchema: {
      ticket_id: z.number().int().positive().describe("The ID of the ticket to retrieve"),
    },
    outputSchema: TicketDetailShape,
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ ticket_id }) => {
    const ticket = await getTicket(ticket_id);
    return structured(shapeTicketDetail(ticket));
  }
);

server.registerTool(
  "get_tickets",
  {
    description: "List tickets with pagination.",
    inputSchema: {
      page: z.number().int().positive().optional().describe("Page number (1-based)"),
      sort_by: z
        .enum(["created_at", "updated_at", "priority", "status"])
        .optional()
        .describe("Field to sort by"),
      sort_order: z.enum(["asc", "desc"]).optional().describe("Sort order"),
    },
    outputSchema: {
      tickets: z.array(z.object(TicketSummaryShape)),
      ...PaginationShape,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => {
    const raw = (await listTickets(args)) as any;
    const data = {
      tickets: (raw.tickets ?? []).map(shapeTicketSummary),
      count: raw.count ?? 0,
      next_page: raw.next_page ?? null,
      previous_page: raw.previous_page ?? null,
    };
    return structured(data);
  }
);

server.registerTool(
  "search_tickets",
  {
    description:
      "Search tickets using Zendesk search syntax (e.g. 'status:open priority:high'). See Zendesk search reference for operators.",
    inputSchema: {
      query: z.string().min(1).describe("Zendesk search query (type:ticket is added automatically)"),
      page: z.number().int().positive().optional().describe("Page number (1-based)"),
    },
    outputSchema: {
      results: z.array(z.object(TicketSummaryShape)),
      ...PaginationShape,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ query, page }) => {
    const raw = (await searchTickets(query, { page })) as any;
    const data = {
      results: (raw.results ?? []).map(shapeTicketSummary),
      count: raw.count ?? 0,
      next_page: raw.next_page ?? null,
      previous_page: raw.previous_page ?? null,
    };
    return structured(data);
  }
);

server.registerTool(
  "get_ticket_comments",
  {
    description:
      "Retrieve comments for a ticket with pagination. Includes attachment metadata (use attachment id with get_ticket_attachment).",
    inputSchema: {
      ticket_id: z.number().int().positive().describe("The ID of the ticket"),
      page: z.number().int().positive().optional().describe("Page number (1-based)"),
    },
    outputSchema: {
      comments: z.array(z.object(CommentShape)),
      ...PaginationShape,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ ticket_id, page }) => {
    const raw = (await getTicketComments(ticket_id, { page })) as any;
    const data = {
      comments: (raw.comments ?? []).map(shapeComment),
      count: raw.count ?? 0,
      next_page: raw.next_page ?? null,
      previous_page: raw.previous_page ?? null,
    };
    return structured(data);
  }
);

server.registerTool(
  "get_ticket_attachment",
  {
    description:
      "Fetch an image attachment (jpeg/png/gif/webp, <=10MB) by its attachment ID from get_ticket_comments.",
    inputSchema: {
      attachment_id: z.number().int().positive().describe("The attachment id from get_ticket_comments"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ attachment_id }) => {
    const meta = await getAttachment(attachment_id);
    const { contentType, dataBase64 } = await fetchAttachment((meta as any).content_url);
    return {
      content: [
        { type: "image" as const, data: dataBase64, mimeType: contentType },
      ],
    };
  }
);

// ─── HTTP transport ─────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "4mb" }));

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", async (req, res) => {
  const domainHeader = req.headers["x-mintmcp-env-zendesk_domain"];
  const zendeskDomain = (typeof domainHeader === "string" ? domainHeader : "")
    || process.env.ZENDESK_DOMAIN
    || "";

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  requestContext.run({ zendeskDomain }, async () => {
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
});

const PORT = parseInt(process.env.PORT || "8000", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Zendesk MCP (read-only) server listening on 0.0.0.0:${PORT}/mcp`
  );
});
