# AI Labs MCP Servers

Custom MCP connectors deployed as hosted connectors on [MintMCP](https://app.mintmcp.com).

## Server Convention

Follow the `mintmcp/zendesk-mcp` pattern exactly:

- **Transport:** Streamable HTTP at `/mcp` on port 8000. Prefer HTTP over stdio.
- **Framework:** Express + `@modelcontextprotocol/sdk` (TypeScript)
- **Auth:** Two modes:
  - **Global API key:** read from `process.env`, shared across all users
  - **Per-user OAuth:** MintMCP handles the OAuth flow. Server just reads `Authorization: Bearer <token>` from the request header. Configure OAuth (auth URL, token URL, client ID/secret, scopes) in MintMCP UI after deploy.
- **Health:** `GET /healthz` returns `{ status: "ok" }`
- **Startup:** `initialize` and `tools/list` must succeed without credentials (tools registered statically, auth checked at call time)
- **Docker:** Multi-stage build, `node:22-slim`, final image under 250MB, `linux/amd64`

## Naming Convention

Connector slugs encode the auth identity in a suffix. All tiers are explicit. No unsuffixed defaults.

| Suffix | Identity | Scope | Example |
|---|---|---|---|
| `-svc` | shared service-account credential | full CRUD | `youtube-svc` |
| `-viewer` | shared service-account credential | read-only | `plausible-viewer` |
| `-user` | per-user OAuth (human identity) | user's own perms | `gsc-user` |
| `-agent` | autonomous AI agent identity | reserved for future use | (none yet) |

Rules:

- `-viewer` collapses identity and scope. Read-only API keys always pair this way in practice. Do not write `-svc-viewer`.
- Reserve `-agent` for AI principals with their own identity (Microsoft Entra Agent ID, Okta AI Agents, Google Agent Identity). Do not use it for shared keys called by AI.
- The MintMCP `userGivenName` (display name in Claude Desktop) should add human context: `youtube-svc` shows as "YouTube (DNSFilter brand)", `youtube-user` shows as "YouTube (your account)", `canny-viewer` shows as "Canny (read-only)".

## Deploy Workflow

Uses MintMCP admin MCP tools (available in Claude via the MintMCP Admin connector):

```
1. docker build --platform linux/amd64 -t <name> .
2. create_registry_push_session()          → get registry creds + finalizeToken
3. docker login / docker tag / docker push → push image
4. deploy_pushed_image(finalizeToken, config) → create connector
   - config: userGivenName, transport {type:"http", path:"/mcp"}, envVars
   - Secret env vars: omit value, isSecret:true → admin fills via URL
5. Verify: get_hosted_connector_status(), list_connector_tools()
```

## Env Var Rules

- `scope: "global"` for shared credentials (one key for the org)
- `scope: "per_user"` only when actions must be attributed to individuals
- `isSecret: true` for API keys/tokens (entered via MintMCP UI, never in code)
- `isSecret: false` for domains, feature flags, non-sensitive config

## Reference Implementations

MintMCP open-sources their own hosted connectors. Use these as the canonical reference for patterns, auth handling, and transport conventions:

- [mintmcp/zendesk-mcp](https://github.com/mintmcp/zendesk-mcp) — OAuth passthrough, HTTP transport (our primary template)
- [mintmcp/salesforce-mcp](https://github.com/mintmcp/salesforce-mcp) — OAuth + Salesforce REST
- [mintmcp/snowflake-mcp](https://github.com/mintmcp/snowflake-mcp) — Database connector pattern
- [mintmcp/elasticsearch-mcp](https://github.com/mintmcp/elasticsearch-mcp) — Search/query pattern
- [mintmcp/google-search-console-mcp](https://github.com/mintmcp/google-search-console-mcp) — Google OAuth
- [mintmcp/teradata-mcp](https://github.com/mintmcp/teradata-mcp) — Database connector pattern

When building a new connector, check these repos first for the closest match to your integration type.

## Structure

Each connector is self-contained: own `src/`, `Dockerfile`, `package.json`. They build and deploy independently.

## Git

Commit as `mikeydiamonds`. Simple messages.
