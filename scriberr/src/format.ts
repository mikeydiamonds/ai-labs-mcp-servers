/** Transcript formatting helpers (SRT / TXT / JSON) with speaker-name resolution.
 * Mirrors the logic in Scriberr's React frontend (useTranscriptDownload.ts). */

import type { SpeakerMapping, Transcript } from "./scriberr-client.js";

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function formatClockTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function speakerMap(mappings: SpeakerMapping[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of mappings) map[m.original_speaker] = m.custom_name;
  return map;
}

function resolve(speaker: string | undefined, map: Record<string, string>): string | undefined {
  if (!speaker) return undefined;
  return map[speaker] || speaker;
}

export function toSRT(transcript: Transcript, mappings: SpeakerMapping[]): string {
  const map = speakerMap(mappings);
  if (!transcript.segments?.length) {
    return `1\n00:00:00,000 --> 99:59:59,999\n${transcript.text}\n\n`;
  }
  let out = "";
  let i = 1;
  for (const seg of transcript.segments) {
    let text = seg.text.trim();
    const who = resolve(seg.speaker, map);
    if (who) text = `${who}: ${text}`;
    out += `${i}\n${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n${text}\n\n`;
    i++;
  }
  return out;
}

export function toTXT(
  transcript: Transcript,
  mappings: SpeakerMapping[],
  opts: { includeTimestamps: boolean; includeSpeakers: boolean }
): string {
  const map = speakerMap(mappings);
  if (!opts.includeTimestamps && !opts.includeSpeakers) return transcript.text;
  if (!transcript.segments?.length) return transcript.text;

  const parts: string[] = [];
  for (const seg of transcript.segments) {
    let line = "";
    if (opts.includeTimestamps) line += `[${formatClockTime(seg.start)}] `;
    if (opts.includeSpeakers) {
      const who = resolve(seg.speaker, map);
      if (who) line += `${who}: `;
    }
    line += seg.text.trim();
    parts.push(line);
  }
  return parts.join("\n\n");
}

export function toJSON(
  transcript: Transcript,
  mappings: SpeakerMapping[],
  opts: { includeTimestamps: boolean; includeSpeakers: boolean }
): Record<string, unknown> {
  const map = speakerMap(mappings);
  if (!opts.includeTimestamps && !opts.includeSpeakers) {
    return { text: transcript.text, format: "simple" };
  }
  if (!transcript.segments?.length) {
    return { text: transcript.text, format: "simple" };
  }
  return {
    text: transcript.text,
    language: transcript.language,
    format: "segmented",
    segments: transcript.segments.map((seg) => {
      const row: Record<string, unknown> = { text: seg.text.trim() };
      if (opts.includeTimestamps) {
        row.start = seg.start;
        row.end = seg.end;
        row.timestamp = formatClockTime(seg.start);
      }
      if (opts.includeSpeakers) {
        const who = resolve(seg.speaker, map);
        if (who) row.speaker = who;
      }
      return row;
    }),
  };
}
