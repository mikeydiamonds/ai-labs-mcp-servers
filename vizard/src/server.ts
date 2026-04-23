/**
 * Vizard MCP server — full API, streamable HTTP, global API key auth.
 * Follows mintmcp/zendesk-mcp conventions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  submitLongVideo,
  submitShortVideo,
  getProjectClips,
  listSocialAccounts,
  publishVideo,
  generateAiSocialCaption,
} from "./vizard-client.js";

const server = new McpServer({ name: "vizard", version: "1.0.0" });

function structured(data: unknown) {
  const obj = data as Record<string, unknown>;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

const videoTypeDesc =
  "Video source type. 1=Remote file URL (.mp4/.mov), 2=YouTube, 3=Google Drive, 4=Vimeo, 5=StreamYard, 6=TikTok, 7=Twitter, 9=Twitch, 10=Loom, 11=Facebook, 12=LinkedIn.";
const ratioDesc =
  "Aspect ratio of output clips. 1=9:16 vertical, 2=1:1 square, 3=4:5 portrait, 4=16:9 horizontal.";
const preferLengthDesc =
  "Preferred clip duration buckets. Array of: 0=auto (cannot combine with others), 1=under 30s, 2=30-60s, 3=60-90s, 4=90s-3min.";
const switchDesc = "Toggle switch. 0=off, 1=on.";
const langDesc =
  "Spoken language code (e.g. 'en', 'es', 'fr', 'zh', 'ja'). Default 'auto' detects language. See Vizard docs for full list.";

// ─── Long video clipping ────────────────────────────────────────────────────

server.registerTool(
  "submit_long_video_for_clipping",
  {
    description:
      "Submit a long-form video to Vizard for AI clipping. Returns a projectId to poll via get_project_clips. Rate limits: 3/min, 20/hour.",
    inputSchema: {
      videoUrl: z.string().describe("Public URL of the source video."),
      videoType: z.number().int().describe(videoTypeDesc),
      lang: z.string().optional().describe(langDesc),
      preferLength: z.array(z.number().int()).optional().describe(preferLengthDesc),
      ratioOfClip: z.number().int().min(1).max(4).optional().describe(ratioDesc),
      templateId: z.number().int().optional().describe("Vizard template ID for branding/style presets."),
      removeSilenceSwitch: z.number().int().min(0).max(1).optional().describe(`Auto-remove silence and filler words. ${switchDesc}`),
      maxClipNumber: z.number().int().min(1).max(100).optional().describe("Max number of clips to return (1-100)."),
      keyword: z.string().optional().describe("Comma-separated keywords to target specific topics/moments."),
      subtitleSwitch: z.number().int().min(0).max(1).optional().describe(`Display subtitles. ${switchDesc} (default 1)`),
      headlineSwitch: z.number().int().min(0).max(1).optional().describe(`Add AI-generated hook headline. ${switchDesc}`),
      emojiSwitch: z.number().int().min(0).max(1).optional().describe(`Auto-add emoji to captions. ${switchDesc}`),
      highlightSwitch: z.number().int().min(0).max(1).optional().describe(`Highlight keywords in subtitles. ${switchDesc}`),
      autoBrollSwitch: z.number().int().min(0).max(1).optional().describe(`Add supplementary B-roll footage. ${switchDesc}`),
      projectName: z.string().optional().describe("Custom project name."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await submitLongVideo(args))
);

// ─── Short video editing ────────────────────────────────────────────────────

server.registerTool(
  "submit_short_video_for_editing",
  {
    description:
      "Submit a short video (under 3 minutes) to Vizard for editing (no clipping). Adds subtitles, B-roll, emojis, headlines, etc. Returns a projectId.",
    inputSchema: {
      videoUrl: z.string().describe("Public URL of the source video."),
      videoType: z.number().int().describe(videoTypeDesc),
      lang: z.string().optional().describe(langDesc),
      ratioOfClip: z.number().int().min(1).max(4).optional().describe(ratioDesc),
      templateId: z.number().int().optional().describe("Vizard template ID for branding/style presets."),
      removeSilenceSwitch: z.number().int().min(0).max(1).optional().describe(`Auto-remove silence and filler words. ${switchDesc}`),
      subtitleSwitch: z.number().int().min(0).max(1).optional().describe(`Display subtitles. ${switchDesc} (default 1)`),
      headlineSwitch: z.number().int().min(0).max(1).optional().describe(`Add AI-generated hook headline. ${switchDesc}`),
      emojiSwitch: z.number().int().min(0).max(1).optional().describe(`Auto-add emoji to captions. ${switchDesc}`),
      highlightSwitch: z.number().int().min(0).max(1).optional().describe(`Highlight keywords in subtitles. ${switchDesc}`),
      autoBrollSwitch: z.number().int().min(0).max(1).optional().describe(`Add supplementary B-roll footage. ${switchDesc}`),
      projectName: z.string().optional().describe("Custom project name."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await submitShortVideo(args))
);

// ─── Query clips ────────────────────────────────────────────────────────────

server.registerTool(
  "get_project_clips",
  {
    description:
      "Retrieve output clips/video for a Vizard project by projectId. Poll after submitting a video.",
    inputSchema: {
      projectId: z.string().describe("Project ID returned by submit_long_video_for_clipping or submit_short_video_for_editing."),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ projectId }) => structured(await getProjectClips(projectId))
);

// ─── Social ─────────────────────────────────────────────────────────────────

server.registerTool(
  "list_social_accounts",
  {
    description:
      "List social media accounts connected to the Vizard workspace. Returns account IDs needed for publish_video.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await listSocialAccounts())
);

server.registerTool(
  "publish_video",
  {
    description:
      "Publish a generated clip to a connected social media account. Caption/title are AI-generated if omitted.",
    inputSchema: {
      finalVideoId: z.number().int().describe("finalVideoId returned by get_project_clips."),
      socialAccountId: z.string().describe("Social account ID from list_social_accounts."),
      publishTime: z.number().int().optional().describe("Unix timestamp in MILLISECONDS (13 digits) for scheduled publish. Vizard treats seconds-values as 1970 and silently no-ops. Omit for immediate post."),
      post: z.string().optional().describe("Custom post caption/description. AI-generated if empty."),
      title: z.string().optional().describe("Video title (YouTube only). AI-generated if blank."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await publishVideo(args))
);

server.registerTool(
  "generate_ai_social_caption",
  {
    description:
      "Generate an AI-written social caption for a finalized clip, tuned per platform/tone/voice.",
    inputSchema: {
      finalVideoId: z.number().int().describe("finalVideoId returned by get_project_clips."),
      aiSocialPlatform: z
        .enum(["All", "TikTok", "Instagram", "YouTube", "Facebook", "LinkedIn", "Twitter"])
        .optional()
        .describe("Target platform for caption optimization."),
      tone: z
        .enum(["Neutral", "Interesting", "Catchy", "Serious", "Question"])
        .optional()
        .describe("Caption tone."),
      voice: z.enum(["First person", "Third person"]).optional().describe("Narrative voice."),
    },
    annotations: { readOnlyHint: false, openWorldHint: true },
  },
  async (args) => structured(await generateAiSocialCaption(args))
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
  console.log(`Vizard MCP server listening on 0.0.0.0:${PORT}/mcp`);
});
