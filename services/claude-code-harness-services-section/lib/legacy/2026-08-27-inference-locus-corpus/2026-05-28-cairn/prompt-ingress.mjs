#!/usr/bin/env node
// prompt-ingress.mjs -- the UserPromptSubmit hook. Your message enters the harness's universe as an
// utterance (live, not from a transcript), is captured/articulated, and the harness composes the
// CONTEXT SPACESUIT -- an SHP projected from the settled memory relevant to this prompt -- which is
// emitted as additionalContext. So the conductor perceives the SHP-wrapped prompt, not the raw text:
// the harness is the sense organ, the SHP is the Umwelt. Cheap + synchronous (no network here; the
// swarm/dream runs async on Stop), so prompts stay fast.

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import suiting from "#script/suiting";
import { project } from "#script/projecting";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CC = "articulating/library/aperiodic-articulation-category/hacking/library/claude-code";
const CAPTURE_LOG = join(ROOT, `${CC}/capturing/capturing.jsonl`);
const MEMORY_LOG = join(ROOT, `${CC}/hacking/library/memory/memory.jsonl`);

const readMemory = () => existsSync(MEMORY_LOG)
  ? readFileSync(MEMORY_LOG, "utf8").trim().split("\n").filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let h = {}; try { h = JSON.parse(raw); } catch {}
  const prompt = String(h.prompt ?? "");
  const t = new Date().toISOString();
  try {
    // 1. the message enters the universe as an utterance (live ingress -> captured experience)
    appendFileSync(CAPTURE_LOG, JSON.stringify({
      e: "user:emsenn", a: "uttered", v: prompt.slice(0, 4000), t, evidence: ["UserPromptSubmit"], placement: "claude-code"
    }) + "\n");
    // 2. the harness composes the context spacesuit: settled memory relevant to this prompt, as an SHP
    const suit = suiting(readMemory(), prompt, { budget: 2000 });
    const shp = project(suit.memory.map((m) => ({ e: m.e, a: m.a, v: m.v })), { title: "context spacesuit" });
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          "Your context spacesuit (an SHP your harness composed from settled memory relevant to this prompt; " +
          "each span is a settled claim, class=predicate, data-e/data-v carry the cell):\n\n" + shp
      }
    }));
  } catch { /* never block the prompt */ }
  process.exit(0);
});
