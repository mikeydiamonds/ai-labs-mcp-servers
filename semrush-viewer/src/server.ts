/**
 * Semrush MCP server — read-only, streamable HTTP, global API key auth.
 * Follows mintmcp/zendesk-mcp conventions. CSV responses parsed to JSON.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  domainOverviewAll,
  domainOverviewSingle,
  domainOrganicKeywords,
  domainPaidKeywords,
  domainOrganicCompetitors,
  keywordOverview,
  keywordRelated,
  keywordQuestions,
  backlinksOverview,
  referringDomains,
  apiUnitsBalance,
} from "./semrush-client.js";

const server = new McpServer({ name: "semrush-readonly", version: "1.0.0" });

function structured(data: unknown) {
  const payload = Array.isArray(data) ? { results: data } : (data as Record<string, unknown>);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: payload,
  };
}

// Common Semrush database codes (country:lang). Not exhaustive; most common listed.
const DatabaseEnum = z
  .enum([
    "us", "uk", "ca", "au", "ie", "nz", "in", "za",
    "de", "fr", "es", "it", "nl", "be", "ch", "at", "se", "no", "fi", "dk", "pl",
    "br", "mx", "ar", "cl", "co",
    "jp", "kr", "sg", "hk", "tw", "my", "id", "ph", "th", "vn",
    "ae", "sa", "tr", "il",
    "ru",
  ])
  .describe("Semrush database code (country). Common: us, uk, ca, au, de, fr, es, it, br, jp, ru");

// ─── Domain reports ────────────────────────────────────────────────────────

server.registerTool(
  "domain_overview_all",
  {
    description:
      "Domain overview across ALL regional databases. Returns rank, organic/paid keywords, traffic, cost per database. Use this to see which countries the domain has presence in.",
    inputSchema: {
      domain: z.string().describe("Domain name (e.g. 'dnsfilter.com')"),
      display_limit: z.number().int().min(1).max(100).optional().describe("Max rows (default: unlimited)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await domainOverviewAll(args))
);

server.registerTool(
  "domain_overview",
  {
    description:
      "Domain overview for a single regional database. Returns rank, organic/paid keywords, traffic, cost. Use this for a single-country snapshot.",
    inputSchema: {
      domain: z.string().describe("Domain name"),
      database: DatabaseEnum,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await domainOverviewSingle(args))
);

server.registerTool(
  "domain_organic_keywords",
  {
    description:
      "Keywords the domain ranks for organically. Returns keyword, position, search volume, CPC, URL, traffic %, competition.",
    inputSchema: {
      domain: z.string().describe("Domain name"),
      database: DatabaseEnum,
      display_limit: z.number().int().min(1).max(10000).optional().describe("Max rows (default: 10)"),
      display_sort: z
        .enum(["tr_desc", "tr_asc", "po_asc", "po_desc", "nq_desc", "nq_asc", "cp_desc"])
        .optional()
        .describe("Sort: tr_desc (traffic desc), po_asc (best positions first), nq_desc (volume desc), etc."),
      display_filter: z.string().optional().describe("Filter (see Semrush docs for syntax)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await domainOrganicKeywords(args))
);

server.registerTool(
  "domain_paid_keywords",
  {
    description:
      "Keywords the domain bids on in paid search. Returns keyword, position, ad block, volume, CPC, traffic %.",
    inputSchema: {
      domain: z.string().describe("Domain name"),
      database: DatabaseEnum,
      display_limit: z.number().int().min(1).max(10000).optional().describe("Max rows (default: 10)"),
      display_sort: z.string().optional().describe("Sort order"),
      display_filter: z.string().optional().describe("Filter"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await domainPaidKeywords(args))
);

server.registerTool(
  "domain_organic_competitors",
  {
    description:
      "Organic search competitors for a domain. Returns competing domains, their common keywords, competition level, traffic, cost.",
    inputSchema: {
      domain: z.string().describe("Domain name"),
      database: DatabaseEnum,
      display_limit: z.number().int().min(1).max(10000).optional().describe("Max rows (default: 10)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await domainOrganicCompetitors(args))
);

// ─── Keyword reports ───────────────────────────────────────────────────────

server.registerTool(
  "keyword_overview",
  {
    description:
      "Keyword overview: search volume, CPC, competition, number of results, monthly trend. Use this to check a single keyword's value.",
    inputSchema: {
      phrase: z.string().describe("Keyword or phrase"),
      database: DatabaseEnum,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await keywordOverview(args))
);

server.registerTool(
  "keyword_related",
  {
    description:
      "Related / similar keywords. Returns keyword variants, volume, CPC, competition. Use this for keyword expansion and content ideation.",
    inputSchema: {
      phrase: z.string().describe("Seed keyword"),
      database: DatabaseEnum,
      display_limit: z.number().int().min(1).max(10000).optional().describe("Max rows (default: 10)"),
      display_sort: z.string().optional().describe("Sort order (e.g. 'nq_desc' for volume desc)"),
      display_filter: z.string().optional().describe("Filter expression"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await keywordRelated(args))
);

server.registerTool(
  "keyword_questions",
  {
    description:
      "Question-style keyword variants (who/what/when/where/why/how). Useful for content marketing and FAQ targeting.",
    inputSchema: {
      phrase: z.string().describe("Seed keyword"),
      database: DatabaseEnum,
      display_limit: z.number().int().min(1).max(10000).optional().describe("Max rows (default: 10)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await keywordQuestions(args))
);

// ─── Backlinks ─────────────────────────────────────────────────────────────

server.registerTool(
  "backlinks_overview",
  {
    description:
      "Backlink profile summary. Returns total backlinks, referring domains/URLs/IPs, follow/nofollow split, and link type breakdown.",
    inputSchema: {
      target: z.string().describe("Target (domain, subdomain, or URL)"),
      target_type: z
        .enum(["root_domain", "domain", "url"])
        .describe("root_domain (all subdomains), domain (specific subdomain), or url (single page)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await backlinksOverview(args))
);

server.registerTool(
  "referring_domains",
  {
    description:
      "Domains linking to the target. Returns domain, authority score, backlink count, IP, country, first/last seen dates.",
    inputSchema: {
      target: z.string().describe("Target (domain, subdomain, or URL)"),
      target_type: z.enum(["root_domain", "domain", "url"]),
      display_limit: z.number().int().min(1).max(10000).optional().describe("Max rows (default: 10)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await referringDomains(args))
);

// ─── Utility ───────────────────────────────────────────────────────────────

server.registerTool(
  "api_units_balance",
  {
    description: "Check remaining Semrush API units. Useful before running expensive bulk queries.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await apiUnitsBalance())
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
  console.log(`Semrush MCP (read-only) server listening on 0.0.0.0:${PORT}/mcp`);
});
