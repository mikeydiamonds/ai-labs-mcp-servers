/**
 * Audio Gateway MCP server — streamable HTTP, global API key auth.
 * Wraps a self-hosted TTS/STT/SFX/voice-cloning gateway.
 * Follows mintmcp/zendesk-mcp conventions.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  bytesToBase64,
  cloneVoiceFromUrl,
  deleteVoice,
  generateSfx,
  generateSpeech,
  getVoice,
  gpuStatus,
  health,
  listModels,
  listVoices,
  transcribeUrl,
  translateUrl,
} from "./audio-client.js";

const server = new McpServer({ name: "tts-gateway", version: "1.0.0" });

function structured(data: unknown) {
  let obj: Record<string, unknown>;
  if (Array.isArray(data)) obj = { items: data };
  else if (data && typeof data === "object") obj = data as Record<string, unknown>;
  else obj = { value: data };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: obj,
  };
}

function audioResult(
  bytes: Uint8Array,
  contentType: string,
  extras: Record<string, unknown> = {}
) {
  const b64 = bytesToBase64(bytes);
  const payload = {
    format: contentType.replace(/^audio\//, "").split(";")[0] || "bin",
    content_type: contentType,
    size_bytes: bytes.byteLength,
    audio_base64: b64,
    ...extras,
  };
  // Keep the visible text compact — binary goes in structuredContent so the LLM
  // can hand it back to a tool without burning the context window.
  const summary = `${payload.format} audio, ${payload.size_bytes} bytes (base64 in structuredContent.audio_base64)`;
  return {
    content: [{ type: "text" as const, text: summary }],
    structuredContent: payload as Record<string, unknown>,
  };
}

// ─── Discovery / health ─────────────────────────────────────────────────

server.registerTool(
  "health_check",
  {
    description:
      "Check which backends are reachable (gateway + chatterbox/qwen3-tts/stable-audio/speaches). Use when a tool call fails to diagnose which service is down.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await health())
);

server.registerTool(
  "gpu_status",
  {
    description:
      "Get GPU queue state: which backend currently holds the lock, how long each backend has been idle, and whether the queue is blocked. Useful to explain a slow or queued request.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await gpuStatus())
);

server.registerTool(
  "list_models",
  {
    description:
      "List all audio models available on the gateway with their capabilities (type=tts/stt/sfx, supported languages, whether they support voice cloning or streaming).",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await listModels())
);

server.registerTool(
  "list_voices",
  {
    description:
      "List all voices available across backends (kokoro presets, qwen3-tts presets + cloned, chatterbox default + cloned). Returns groups by model with counts and summary totals.",
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async () => structured(await listVoices())
);

server.registerTool(
  "get_voice",
  {
    description: "Get metadata for a specific voice by name (language, gender, which backends support it).",
    inputSchema: {
      name: z.string().min(1).describe("Voice id, e.g. 'ryan', 'af_bella', or a custom cloned name"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  async ({ name }) => structured(await getVoice(name))
);

// ─── TTS ────────────────────────────────────────────────────────────────

const SpeechModelEnum = z.enum(["qwen3", "chatterbox", "kokoro"]);
const SpeechFormatEnum = z.enum(["mp3", "wav", "opus"]);

server.registerTool(
  "generate_speech",
  {
    description:
      "Generate speech from text. Picks the right backend by model:\n" +
      "• kokoro — fast (<300ms), 54 preset voices, no cloning. Best for real-time/short phrases.\n" +
      "• qwen3 — multilingual (10 langs), supports voice cloning + voice-design via 'instruct' param.\n" +
      "• chatterbox — English only, supports voice cloning + emotion control (exaggeration, cfg_weight).\n" +
      "Returns base64-encoded audio in structuredContent.audio_base64.",
    inputSchema: {
      input: z.string().min(1).max(50000).describe("Text to synthesize. Long text is auto-chunked by the gateway."),
      model: SpeechModelEnum.optional().describe("TTS backend (default: qwen3)"),
      voice: z.string().max(128).optional().describe("Voice id from list_voices (default: 'default')"),
      response_format: SpeechFormatEnum.optional().describe("Audio format (default: mp3)"),
      speed: z.number().min(0.25).max(4.0).optional().describe("Playback speed (default: 1.0)"),
      language: z.string().max(16).optional().describe("Language code, e.g. 'en', 'zh' (qwen3 benefits from explicit)"),
      instruct: z
        .string()
        .max(500)
        .optional()
        .describe("qwen3 only: natural-language voice description, e.g. 'wise elderly wizard with a deep, mystical voice'. Overrides 'voice'."),
      exaggeration: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("chatterbox only: emotion intensity 0-1 (default 0.5; 0.7+ is dramatic)"),
      cfg_weight: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("chatterbox only: voice adherence 0-1 (default 0.5; ~0.3 for faster/expressive speakers)"),
      seed: z.number().int().min(0).max(2 ** 31 - 1).optional().describe("Fixed seed for reproducibility"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async (args) => {
    const { bytes, contentType } = await generateSpeech(args);
    return audioResult(bytes, contentType, {
      model: args.model ?? "qwen3",
      voice: args.voice ?? "default",
      characters: args.input.length,
    });
  }
);

// ─── SFX ────────────────────────────────────────────────────────────────

server.registerTool(
  "generate_sfx",
  {
    description:
      "Generate a sound effect from a descriptive prompt via Stable Audio Open. Output is 44.1kHz stereo WAV, up to 47 seconds.\n" +
      "Prompt tips: be descriptive ('thunder rumbling, dramatic storm, deep bass' > 'thunder'), add quality keywords ('high-quality stereo'), match duration to sound type (impacts 3-6s, loops 8-15s, ambience 15-47s).",
    inputSchema: {
      prompt: z.string().min(1).max(1000).describe("Descriptive sound prompt"),
      duration: z.number().min(1).max(47).optional().describe("Seconds, 1-47 (default: 10)"),
      num_inference_steps: z
        .number()
        .int()
        .min(10)
        .max(200)
        .optional()
        .describe("Quality steps (default: 100). 100+ for production, 50 for drafts."),
      guidance_scale: z.number().min(1).max(15).optional().describe("Prompt adherence 1-15 (default: 7)"),
      negative_prompt: z
        .string()
        .max(1000)
        .optional()
        .describe("What to avoid (default filters out voice/speech for pure SFX)"),
      seed: z.number().int().min(0).max(2 ** 31 - 1).optional().describe("Fixed seed for reproducibility"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async (args) => {
    const { bytes, contentType } = await generateSfx(args);
    return audioResult(bytes, contentType, {
      prompt: args.prompt.slice(0, 80),
      duration: args.duration ?? 10,
    });
  }
);

// ─── STT ────────────────────────────────────────────────────────────────

server.registerTool(
  "transcribe_audio",
  {
    description:
      "Transcribe audio from a URL to text via faster-whisper. One-shot, synchronous — fast for short clips (voice memos, snippets). For long-form content with speaker diarization and persistent storage, use the Scriberr MCP instead.\n" +
      "Supports 99+ languages; set language='en' etc. for best accuracy, or omit for auto-detection.",
    inputSchema: {
      audio_url: z.string().url().describe("Public HTTPS URL of audio file (mp3/wav/m4a/etc.). MCP fetches and uploads it."),
      language: z
        .string()
        .max(16)
        .optional()
        .describe("ISO-639-1 language code (auto-detects if omitted)"),
      response_format: z
        .enum(["json", "text", "srt", "vtt", "verbose_json"])
        .optional()
        .describe("Output shape (default: json)"),
      prompt: z
        .string()
        .max(500)
        .optional()
        .describe("Optional hint text to bias vocabulary (e.g. jargon, proper nouns)"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ audio_url, language, response_format, prompt }) =>
    structured(await transcribeUrl(audio_url, { language, response_format, prompt }))
);

server.registerTool(
  "translate_audio_to_english",
  {
    description:
      "Translate audio from any supported source language to English text. Uses Whisper's translation mode (source → English only, no other targets).",
    inputSchema: {
      audio_url: z.string().url().describe("Public HTTPS URL of audio file"),
      response_format: z
        .enum(["json", "text", "srt", "vtt", "verbose_json"])
        .optional()
        .describe("Output shape (default: json)"),
      prompt: z.string().max(500).optional().describe("Optional vocabulary hint"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ audio_url, response_format, prompt }) =>
    structured(await translateUrl(audio_url, { response_format, prompt }))
);

// ─── Voice cloning ──────────────────────────────────────────────────────

server.registerTool(
  "clone_voice",
  {
    description:
      "Clone a voice from an audio or video URL. The gateway extracts audio (if video), trims to ~35s at a silence point, and auto-transcribes the reference. The voice is cloned to BOTH qwen3 (multilingual) and chatterbox (English + emotion control) backends so it can be used with either model in generate_speech.",
    inputSchema: {
      audio_url: z
        .string()
        .url()
        .describe("URL of audio (wav/mp3/flac/ogg/m4a) or video (mp4/mkv/webm/mov/avi)"),
      name: z
        .string()
        .regex(/^[A-Za-z0-9_.-]{1,64}$/)
        .describe("Name for the cloned voice (letters, digits, _ . -). Will be reusable via generate_speech's voice param."),
      transcript: z
        .string()
        .max(5000)
        .optional()
        .describe("Exact words spoken in the reference. Auto-transcribed if omitted."),
      language: z.string().max(16).optional().describe("Language of the reference audio"),
      gender: z.enum(["m", "f"]).optional(),
      description: z.string().max(200).optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ audio_url, name, transcript, language, gender, description }) =>
    structured(
      await cloneVoiceFromUrl(audio_url, name, { transcript, language, gender, description })
    )
);

server.registerTool(
  "delete_voice",
  {
    description:
      "Delete a cloned voice from both qwen3 and chatterbox backends. Preset voices (kokoro, qwen3 presets) cannot be deleted — only custom clones.",
    inputSchema: {
      name: z.string().min(1).describe("Voice name to delete"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
  },
  async ({ name }) => structured(await deleteVoice(name))
);

// ─── HTTP transport ─────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));

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
  console.log(`TTS Gateway MCP server listening on 0.0.0.0:${PORT}/mcp`);
});
