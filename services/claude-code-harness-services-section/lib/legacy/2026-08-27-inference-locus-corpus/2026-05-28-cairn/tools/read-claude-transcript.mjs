#!/usr/bin/env node
// capture-transcript.mjs -- lift a REAL Claude Code session transcript into the harness as experiences
// (actual prompts + replies, not a paraphrase). One-time / reusable.
//   node capture-transcript.mjs <transcript.jsonl>

import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // tools/ -> catalog root
const LOG = join(ROOT, "articulating/library/aperiodic-articulation-category/hacking/library/claude-code/capturing/capturing.jsonl");

const path = process.argv[2];
if (!path) { console.error("usage: capture-transcript.mjs <transcript.jsonl>"); process.exit(1); }

const textOf = (content) => Array.isArray(content)
  ? content.filter((c) => c.type === "text").map((c) => c.text).join(" ")
  : (typeof content === "string" ? content : "");

let n = 0;
const src = path.split("/").pop();
for (const line of readFileSync(path, "utf8").trim().split("\n")) {
  let row; try { row = JSON.parse(line); } catch { continue; }
  if (row.type !== "user" && row.type !== "assistant") continue;
  const msg = row.message; if (!msg) continue;
  const body = textOf(msg.content).trim();
  if (!body) continue;
  const isUser = msg.role === "user";
  appendFileSync(LOG, JSON.stringify({
    e: isUser ? "user:emsenn" : "claude-code",
    a: isUser ? "uttered" : "replied",
    v: body.slice(0, isUser ? 4000 : 1500),
    t: row.timestamp || new Date().toISOString(),
    evidence: ["transcript:" + src],
    placement: "claude-code"
  }) + "\n");
  n++;
}
console.log(`captured ${n} real turns from ${src} into the harness capture log`);
