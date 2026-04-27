/**
 * Scriberr MCP server — streamable HTTP, global API key auth.
 * Wraps a self-hosted Scriberr instance for transcription + diarization.
 * Follows mintmcp/zendesk-mcp conventions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  deleteJob,
  getJob,
  getModels,
  getSpeakers,
  getStatus,
  getTranscript,
  killJob,
  listJobs,
  listProfiles,
  setSpeakers,
  startJob,
  submitYoutube,
  updateTitle,
  type WhisperXParams,
} from "./scriberr-client.js";
import { toJSON, toSRT, toTXT } from "./format.js";

const server = new McpServer({ name: "scriberr", version: "1.0.0" });

function structured(data: unknown) {
  // structuredContent must be a record (object), not an array or primitive.
  let obj: Record<string, unknown>;
  if (Array.isArray(data)) {
    obj = { items: data };
  } else if (data && typeof data === "object") {
    obj = data as Record<string, unknown>;
  } else {
    obj = { value: data };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

function text(content: string) {
  return {
    content: [{ type: "text" as const, text: content }],
    structuredContent: { text: content },
  };
}

// ─── Job discovery ──────────────────────────────────────────────────────

server.registerTool(
  "list_transcriptions",
  {
    description:
      "List transcription jobs with optional search and filtering. Jobs are paginated.",
    inputSchema: {
      q: z.string().optional().describe("Search text in title and audio filename"),
      status: z
        .string()
        .optional()
        .describe("Filter by status (pending, processing, completed, failed, uploaded)"),
      page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
      limit: z.number().int().min(1).max(100).optional().describe("Items per page (default: 10)"),
      sort_by: z.string().optional().describe("Field to sort by, e.g. 'created_at'"),
      sort_order: z.enum(["asc", "desc"]).optional(),
      updated_after: z.string().optional().describe("RFC3339 timestamp — only jobs updated after this"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async (args) => structured(await listJobs(args))
);

server.registerTool(
  "get_transcription",
  {
    description: "Get full job record (metadata, status, parameters) by ID.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ job_id }) => structured(await getJob(job_id))
);

server.registerTool(
  "get_job_status",
  {
    description:
      "Lightweight status check for a job. Use this to poll an in-flight transcription. Status values: pending, processing, completed, failed.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ job_id }) => {
    const j = await getStatus(job_id);
    return structured({ id: j.id, status: j.status, title: j.title, updated_at: j.updated_at });
  }
);

// ─── Transcript retrieval with speaker resolution ───────────────────────

server.registerTool(
  "get_transcript",
  {
    description:
      "Get the transcript for a completed job. Returns JSON segments by default; pass format='srt' or 'txt' for exportable text. Speaker labels (e.g. SPEAKER_00) are replaced with custom names if resolve_speakers=true (default).",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
      format: z.enum(["json", "srt", "txt"]).optional().describe("Output format (default: json)"),
      resolve_speakers: z
        .boolean()
        .optional()
        .describe("Replace SPEAKER_NN with custom names (default: true)"),
      include_timestamps: z
        .boolean()
        .optional()
        .describe("For txt/json: include per-segment timestamps (default: true)"),
      include_speakers: z
        .boolean()
        .optional()
        .describe("For txt/json: include speaker labels (default: true)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ job_id, format, resolve_speakers, include_timestamps, include_speakers }) => {
    const fmt = format ?? "json";
    const resolve = resolve_speakers ?? true;
    const ts = include_timestamps ?? true;
    const sp = include_speakers ?? true;

    const envelopeP = getTranscript(job_id);
    const mappingsP = resolve ? getSpeakers(job_id).catch(() => []) : Promise.resolve([]);
    const [envelope, mappings] = await Promise.all([envelopeP, mappingsP]);
    const t = envelope.transcript;

    if (fmt === "srt") return text(toSRT(t, mappings));
    if (fmt === "txt")
      return text(toTXT(t, mappings, { includeTimestamps: ts, includeSpeakers: sp }));
    return structured(toJSON(t, mappings, { includeTimestamps: ts, includeSpeakers: sp }));
  }
);

server.registerTool(
  "get_speakers",
  {
    description:
      "Get custom speaker-name mappings for a job (e.g. {SPEAKER_00: 'Mikey'}). Empty list means speakers haven't been labeled.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ job_id }) => structured(await getSpeakers(job_id))
);

server.registerTool(
  "set_speakers",
  {
    description:
      "Assign custom names to diarized speakers. Pyannote labels speakers as SPEAKER_00, SPEAKER_01, etc. — pass a mapping of original_speaker → custom_name.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
      mappings: z
        .array(
          z.object({
            original_speaker: z.string().describe("e.g. 'SPEAKER_00'"),
            custom_name: z.string().describe("e.g. 'Mikey'"),
          })
        )
        .min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ job_id, mappings }) => structured(await setSpeakers(job_id, mappings))
);

// ─── Submission ──────────────────────────────────────────────────────────

const SubmissionOpts = {
  model: z
    .string()
    .optional()
    .describe("Whisper model size: tiny, base, small, medium, large-v3 (default: medium)"),
  model_family: z
    .enum(["whisper", "nvidia_parakeet", "nvidia_canary", "openai"])
    .optional()
    .describe("Model family (default: whisper)"),
  language: z.string().optional().describe("Language code, e.g. 'en' (default: auto-detect)"),
  device: z
    .enum(["cuda", "cpu", "auto"])
    .optional()
    .describe("Inference device (default: cuda for GPU instances)"),
  compute_type: z
    .enum(["float16", "float32", "int8"])
    .optional()
    .describe("Precision (default: float16 on GPU)"),
  batch_size: z.number().int().min(1).max(64).optional().describe("Batch size (default: 16)"),
  diarize: z.boolean().optional().describe("Enable speaker diarization (default: false)"),
  diarize_model: z
    .enum(["pyannote", "nvidia_sortformer"])
    .optional()
    .describe("Diarization backend. pyannote needs HF_TOKEN; nvidia_sortformer does not. Default: pyannote."),
  speaker_count: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("Exact number of speakers (sets min=max). Useful hint for known 2-person interviews."),
  min_speakers: z.number().int().min(1).optional().describe("Minimum speakers hint for diarization"),
  max_speakers: z.number().int().min(1).optional().describe("Maximum speakers hint for diarization"),
} as const;

function buildParams(o: {
  model?: string;
  model_family?: string;
  language?: string;
  device?: string;
  compute_type?: string;
  batch_size?: number;
  diarize?: boolean;
  diarize_model?: string;
  speaker_count?: number;
  min_speakers?: number;
  max_speakers?: number;
}): WhisperXParams {
  const p: WhisperXParams = {
    model_family: o.model_family ?? "whisper",
    model: o.model ?? "medium",
    device: o.device ?? "cuda",
    compute_type: o.compute_type ?? "float16",
    batch_size: o.batch_size ?? 16,
    task: "transcribe",
    diarize: o.diarize ?? false,
    diarize_model: o.diarize_model ?? "pyannote",
  };
  if (o.language) p.language = o.language;
  if (o.diarize) {
    if (o.speaker_count) {
      p.min_speakers = o.speaker_count;
      p.max_speakers = o.speaker_count;
    } else {
      if (o.min_speakers) p.min_speakers = o.min_speakers;
      if (o.max_speakers) p.max_speakers = o.max_speakers;
    }
  }
  return p;
}

server.registerTool(
  "submit_youtube",
  {
    description:
      "Download audio from a YouTube URL and start transcribing it. Returns the job ID — use get_job_status to poll until status='completed', then get_transcript. This single call chains the underlying /youtube (upload) and /start (kick off) endpoints.",
    inputSchema: {
      url: z.string().describe("YouTube video URL"),
      title: z.string().optional().describe("Job title (defaults to video title)"),
      ...SubmissionOpts,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ url, title, ...opts }) => {
    const job = await submitYoutube(url, title);
    const params = buildParams(opts);
    const started = await startJob(job.id, params);
    return structured({
      id: started.id,
      title: started.title,
      status: started.status,
      diarization: started.diarization,
      parameters: started.parameters,
    });
  }
);

server.registerTool(
  "start_job",
  {
    description:
      "Start transcription on a job that is in the 'uploaded' state. Only needed if you uploaded a file via a different path (e.g. folder watcher) and want to kick off processing now.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
      ...SubmissionOpts,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ job_id, ...opts }) => structured(await startJob(job_id, buildParams(opts)))
);

// ─── Job management ─────────────────────────────────────────────────────

server.registerTool(
  "kill_job",
  {
    description: "Cancel a currently processing transcription job.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ job_id }) => structured(await killJob(job_id))
);

server.registerTool(
  "delete_transcription",
  {
    description:
      "Permanently delete a transcription job and its audio/transcript files. This cannot be undone.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ job_id }) => structured(await deleteJob(job_id))
);

server.registerTool(
  "update_title",
  {
    description: "Rename a transcription job.",
    inputSchema: {
      job_id: z.string().describe("Transcription job UUID"),
      title: z.string().min(1).describe("New title"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ job_id, title }) => structured(await updateTitle(job_id, title))
);

// ─── Server metadata ────────────────────────────────────────────────────

server.registerTool(
  "list_models",
  {
    description:
      "List transcription models available on the server (whisper, parakeet, canary, openai_whisper) and their supported languages/features.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await getModels())
);

server.registerTool(
  "list_profiles",
  {
    description: "List saved transcription profiles (presets combining model + diarization settings).",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await listProfiles())
);

// ─── HTTP transport ─────────────────────────────────────────────────────

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
  console.log(`Scriberr MCP server listening on 0.0.0.0:${PORT}/mcp`);
});
