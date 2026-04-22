# AI Labs MCP Servers

Custom MCP servers for DNSFilter, deployed as hosted connectors on MintMCP.

## Connectors

| Connector | Transport | Auth | Tools | Status |
|---|---|---|---|---|
| [zendesk-readonly](./zendesk-readonly/) | HTTP | Global API token | 5 read-only | Pending API token |
| [canny](./canny/) | HTTP | Global API key | 24 read-only | Live on MintMCP |
| [plausible](./plausible/) | HTTP | Global API key | 8 read-only | Pending deploy |
| [semrush](./semrush/) | HTTP | Global API key | 11 read-only | Ready to deploy |
| [gsc](./gsc/) | HTTP | Per-user OAuth (Google) | 15 tools (13 read, 2 write) | Ready to deploy |
| [vitally](./vitally/) | HTTP | Global API key | 69 tools (full CRUD) | Pending deploy |
| [vizard](./vizard/) | HTTP | Global API key | 6 tools (full API) | Pending deploy |

## Structure

Each connector is self-contained with its own `Dockerfile`, `package.json`, and source. They build and deploy independently to MintMCP.

```
zendesk-readonly/    # Read-only Zendesk access via service account
canny/               # Read-only Canny feedback access
plausible/           # Read-only Plausible Analytics access
semrush/             # Read-only Semrush SEO & competitive intelligence
gsc/                 # Google Search Console (per-user OAuth, forked from mintmcp)
vitally/             # Vitally Customer Success Platform (full REST surface)
vizard/              # Vizard AI video clipping, editing, publishing
```

## Deploying to MintMCP

From any connector directory:

```bash
# Build
docker build --platform linux/amd64 -t <name> .

# Push (get creds from MintMCP admin MCP)
docker tag <name> <imageRef>
docker push <imageRef>

# Deploy via MintMCP admin MCP tools
```
