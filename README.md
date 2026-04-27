# AI Labs MCP Servers

Custom MCP servers for DNSFilter, deployed as hosted connectors on MintMCP.

## Connectors

Naming convention: slug suffix encodes auth identity. `-svc` = shared service-account credential, full CRUD. `-viewer` = shared service-account credential, read-only. `-user` = per-user OAuth. `-agent` reserved for autonomous AI agents. See [CLAUDE.md](./CLAUDE.md) for the full convention.

| Connector | Transport | Auth | Tools | Status |
|---|---|---|---|---|
| [zendesk-viewer](./zendesk-viewer/) | HTTP | Global API token | 5 read-only | Pending API token |
| [canny-viewer](./canny-viewer/) | HTTP | Global API key | 24 read-only | Live on MintMCP |
| [plausible-viewer](./plausible-viewer/) | HTTP | Global API key | 8 read-only | Live on MintMCP |
| [semrush-viewer](./semrush-viewer/) | HTTP | Global API key | 11 read-only | Live on MintMCP |
| [reddit-viewer](./reddit-viewer/) | HTTP | Script-app OAuth | Read-only | Live on MintMCP |
| [gsc-user](./gsc-user/) | HTTP | Per-user OAuth (Google) | 15 tools (13 read, 2 write) | Live on MintMCP |
| [youtube-svc](./youtube-svc/) | HTTP | Global OAuth2 refresh-token | 13 tools (6 read, 7 write) | Live on MintMCP |
| [youtube-user](./youtube-user/) | HTTP | Per-user OAuth (Google) | 13 tools (6 read, 7 write) | Ready to deploy |
| [gong-viewer](./gong-viewer/) | HTTP | Global API key (Basic) | 11 read-only | Live on MintMCP |
| [vizard-svc](./vizard-svc/) | HTTP | Global API key | 6 tools (full API) | Live on MintMCP |
| [vitally-svc](./vitally-svc/) | HTTP | Global API key | 69 tools (full CRUD) | Pending deploy |
| [scriberr-svc](./scriberr-svc/) | HTTP | Global API key | Self-hosted transcription | Pending deploy |
| [tts-gateway-svc](./tts-gateway-svc/) | HTTP | Global API key | Self-hosted audio gateway | Pending deploy |

## Structure

Each connector is self-contained with its own `Dockerfile`, `package.json`, and source. They build and deploy independently to MintMCP.

```
zendesk-viewer/      # Read-only Zendesk access via service account
canny-viewer/        # Read-only Canny feedback access
plausible-viewer/    # Read-only Plausible Analytics access
semrush-viewer/      # Read-only Semrush SEO & competitive intelligence
reddit-viewer/       # Reddit read-only via script-app OAuth
gong-viewer/         # Gong read-only via service-account API key (Basic auth)
gsc-user/            # Google Search Console (per-user OAuth, forked from mintmcp)
youtube-svc/         # YouTube Data API v3 (shared OAuth2 refresh-token, brand identity)
youtube-user/        # YouTube Data API v3 (per-user OAuth passthrough)
vizard-svc/          # Vizard AI video clipping, editing, publishing
vitally-svc/         # Vitally Customer Success Platform (full REST surface)
scriberr-svc/        # Self-hosted Scriberr transcription
tts-gateway-svc/     # Self-hosted TTS/STT/voice-cloning audio gateway
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
