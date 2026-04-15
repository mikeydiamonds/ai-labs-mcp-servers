# AI Labs MCP Servers

Custom read-only MCP connectors deployed as hosted connectors on [MintMCP](https://app.mintmcp.com).

## Server Convention

Follow the `mintmcp/zendesk-mcp` pattern exactly:

- **Transport:** Streamable HTTP at `/mcp` on port 8000. Prefer HTTP over stdio.
- **Framework:** Express + `@modelcontextprotocol/sdk` (TypeScript)
- **Auth:** Global API key/token from `process.env`. No per-user credentials.
- **Health:** `GET /healthz` returns `{ status: "ok" }`
- **Startup:** `initialize` and `tools/list` must succeed without credentials (tools registered statically, auth checked at call time)
- **Docker:** Multi-stage build, `node:22-slim`, final image under 250MB, `linux/amd64`
- **Tools:** Read-only only. No mutating tools registered.

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

## Structure

Each connector is self-contained: own `src/`, `Dockerfile`, `package.json`. They build and deploy independently.

## Git

Commit as `mikeydiamonds`. Simple messages.
