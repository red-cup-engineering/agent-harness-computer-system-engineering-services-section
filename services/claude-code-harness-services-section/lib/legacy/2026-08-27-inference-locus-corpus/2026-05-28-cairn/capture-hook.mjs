#!/usr/bin/env node
// capture-hook.mjs -- Claude Code hook: records REAL session activity as experiences, and on Stop runs
// INTERNAL dreaming (network-free) to consolidate memory + recompose the wake spacesuit. Wire on
// UserPromptSubmit / PostToolUse / Stop. Cheap + robust: never blocks the session (always exits 0).

import { appendFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import dreaming from "#script/finite-dreaming";
import suiting from "#script/suiting";
import { project } from "#script/projecting";

const HARNESS = "/home/emsenn/561-group/development/experimental/claude-code-harness";
const CC = `${HARNESS}/articulating/library/aperiodic-articulation-category/hacking/library/claude-code`;
const CAPTURE_LOG = `${CC}/capturing/capturing.jsonl`;
const MEMORY_LOG = `${CC}/hacking/library/memory/memory.jsonl`;
const WAKE = `${HARNESS}/wake-spacesuit.html`;

const textOf = (content) => Array.isArray(content)
  ? content.filter((c) => c.type === "text").map((c) => c.text).join(" ")
  : (typeof content === "string" ? content : "");
const readLog = (p) => existsSync(p)
  ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let h = {}; try { h = JSON.parse(raw); } catch {}
  const t = new Date().toISOString();
  const ev = h.hook_event_name || h.hookEventName;
  try {
    const rows = [];
    if (ev === "UserPromptSubmit" && h.prompt) {
      rows.push({ e: "user:emsenn", a: "uttered", v: String(h.prompt).slice(0, 4000), t, evidence: ["UserPromptSubmit"], placement: "claude-code" });
    } else if (ev === "PostToolUse" && h.tool_name) {
      rows.push({ e: `tool:${h.tool_name}`, a: "invoked", v: JSON.stringify(h.tool_input ?? {}).slice(0, 800), t, evidence: ["PostToolUse"], placement: "claude-code" });
    } else if (ev === "Stop" && h.transcript_path) {
      const lines = readFileSync(h.transcript_path, "utf8").trim().split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = JSON.parse(lines[i]); const msg = m.message;
        if (msg && msg.role === "assistant") {
          const body = textOf(msg.content).trim();
          if (body) { rows.push({ e: "claude-code", a: "replied", v: body.slice(0, 2000), t, evidence: ["Stop"], placement: "claude-code" }); break; }
        }
      }
    }
    for (const r of rows) appendFileSync(CAPTURE_LOG, JSON.stringify(r) + "\n");

    // on Stop: INTERNAL dreaming (no network) -> consolidate + recompose the wake spacesuit
    if (ev === "Stop") {
      const derived = dreaming(readLog(MEMORY_LOG));
      for (const c of derived) appendFileSync(MEMORY_LOG, JSON.stringify(c) + "\n");
      const utters = readLog(CAPTURE_LOG).filter((r) => r.a === "uttered");
      const focus = utters.length ? String(utters[utters.length - 1].v).slice(0, 200) : "claude-code harness";
      const suit = suiting(readLog(MEMORY_LOG), focus, { budget: 2000 });
      writeFileSync(WAKE, project(suit.memory.map((m) => ({ e: m.e, a: m.a, v: m.v }))));
    }
  } catch { /* never block the session */ }
  process.exit(0);
});
