/**
 * Plausible Analytics MCP server — read-only, streamable HTTP, global API key auth.
 * Follows mintmcp/zendesk-mcp conventions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  listSites,
  listTeams,
  getSite,
  listGoals,
  listCustomProps,
  query,
  type QueryPayload,
} from "./plausible-client.js";

const server = new McpServer({ name: "plausible-readonly", version: "1.0.0" });

function structured(data: unknown) {
  const obj = (data && typeof data === "object" ? data : { value: data }) as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

// ─── Sites metadata ────────────────────────────────────────────────────────

server.registerTool(
  "list_sites",
  {
    description: "List all sites the API key has access to.",
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional().describe("Max results (default: 100)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      before: z.string().optional().describe("Pagination cursor for previous page"),
      team_id: z.string().optional().describe("Filter by team ID"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listSites(args))
);

server.registerTool(
  "list_teams",
  {
    description: "List all teams the API key has access to.",
    inputSchema: {
      limit: z.number().int().min(1).max(1000).optional().describe("Max results (default: 100)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      before: z.string().optional().describe("Pagination cursor for previous page"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listTeams(args))
);

server.registerTool(
  "get_site",
  {
    description: "Get site details by domain (site ID).",
    inputSchema: {
      site_id: z.string().describe("Site domain (e.g. 'dnsfilter.com')"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ site_id }) => structured(await getSite(site_id))
);

server.registerTool(
  "list_goals",
  {
    description: "List conversion goals configured for a site.",
    inputSchema: {
      site_id: z.string().describe("Site domain"),
      limit: z.number().int().min(1).max(1000).optional().describe("Max results (default: 100)"),
      after: z.string().optional().describe("Pagination cursor for next page"),
      before: z.string().optional().describe("Pagination cursor for previous page"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listGoals(args))
);

server.registerTool(
  "list_custom_properties",
  {
    description: "List custom properties configured for a site.",
    inputSchema: {
      site_id: z.string().describe("Site domain"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ site_id }) => structured(await listCustomProps({ site_id }))
);

// ─── Stats query helpers ───────────────────────────────────────────────────

const MetricEnum = z.enum([
  "visitors",
  "visits",
  "pageviews",
  "views_per_visit",
  "bounce_rate",
  "visit_duration",
  "events",
  "scroll_depth",
  "time_on_page",
  "conversion_rate",
  "group_conversion_rate",
  "average_revenue",
  "total_revenue",
  "percentage",
]);

const DateRangeSchema = z
  .union([
    z.string(),
    z.tuple([z.string(), z.string()]),
  ])
  .describe(
    'Date range: preset like "day", "7d", "30d", "month", "6mo", "12mo", "all", or ISO tuple like ["2026-01-01","2026-01-31"]'
  );

server.registerTool(
  "get_aggregate",
  {
    description:
      "Get aggregate totals for a site over a date range. No grouping. Returns one row with the requested metrics.",
    inputSchema: {
      site_id: z.string().describe("Site domain (e.g. 'dnsfilter.com')"),
      date_range: DateRangeSchema,
      metrics: z.array(MetricEnum).min(1).describe("Metrics to calculate"),
      filters: z.array(z.unknown()).optional().describe("Filter conditions, e.g. [['is','visit:source',['Google']]]"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ site_id, date_range, metrics, filters }) => {
    const payload: QueryPayload = { site_id, date_range, metrics };
    if (filters) payload.filters = filters;
    return structured(await query(payload));
  }
);

server.registerTool(
  "get_timeseries",
  {
    description:
      "Get metrics bucketed over time (day/hour/month/week). Returns one row per time bucket.",
    inputSchema: {
      site_id: z.string().describe("Site domain"),
      date_range: DateRangeSchema,
      metrics: z.array(MetricEnum).min(1).describe("Metrics to calculate"),
      interval: z.enum(["minute", "hour", "day", "week", "month"]).optional().describe("Time bucket size (default: day)"),
      filters: z.array(z.unknown()).optional().describe("Filter conditions"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ site_id, date_range, metrics, interval, filters }) => {
    const bucket = interval ?? "day";
    const payload: QueryPayload = {
      site_id,
      date_range,
      metrics,
      dimensions: [`time:${bucket}`],
    };
    if (filters) payload.filters = filters;
    return structured(await query(payload));
  }
);

server.registerTool(
  "get_breakdown",
  {
    description:
      "Get metrics grouped by a dimension. Common dimensions: event:page, event:hostname, visit:source, visit:referrer, visit:utm_source, visit:utm_campaign, visit:device, visit:browser, visit:os, visit:country, visit:entry_page, visit:exit_page.",
    inputSchema: {
      site_id: z.string().describe("Site domain"),
      date_range: DateRangeSchema,
      metrics: z.array(MetricEnum).min(1).describe("Metrics to calculate"),
      dimension: z.string().describe("Dimension to group by, e.g. 'visit:source' or 'event:page'"),
      filters: z.array(z.unknown()).optional().describe("Filter conditions"),
      limit: z.number().int().min(1).max(10000).optional().describe("Max rows (default: 100)"),
      offset: z.number().int().min(0).optional().describe("Pagination offset (default: 0)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ site_id, date_range, metrics, dimension, filters, limit, offset }) => {
    const payload: QueryPayload = {
      site_id,
      date_range,
      metrics,
      dimensions: [dimension],
      pagination: { limit: limit ?? 100, offset: offset ?? 0 },
    };
    if (filters) payload.filters = filters;
    return structured(await query(payload));
  }
);

server.registerTool(
  "query_stats",
  {
    description:
      "Raw passthrough to Plausible's POST /api/v2/query. Use when get_aggregate/get_timeseries/get_breakdown don't cover the shape you need (e.g. multiple dimensions, custom order_by, or include.imports).",
    inputSchema: {
      site_id: z.string().describe("Site domain"),
      date_range: DateRangeSchema,
      metrics: z.array(MetricEnum).min(1).describe("Metrics to calculate"),
      dimensions: z.array(z.string()).optional().describe("Attributes to group by"),
      filters: z.array(z.unknown()).optional().describe("Filter conditions"),
      order_by: z.array(z.unknown()).optional().describe("Sort order"),
      include: z.record(z.string(), z.unknown()).optional().describe("Additional options (imports, time_labels, total_rows)"),
      pagination: z
        .object({
          limit: z.number().int().min(1).max(10000).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await query(args as QueryPayload))
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
  console.log(`Plausible MCP (read-only) server listening on 0.0.0.0:${PORT}/mcp`);
});
