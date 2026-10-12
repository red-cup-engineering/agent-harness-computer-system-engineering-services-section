#!/usr/bin/env node
// session-start-inject.mjs -- a Claude Code SessionStart hook. It emits the dreamed spacesuit as
// additionalContext, so the agent WAKES already carrying the understanding its subconscious dreamed
// from prior sessions. This is the real context injection: the loop closes onto the live agent.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url));
const WAKE = join(ROOT, "wake-spacesuit.html");

if (existsSync(WAKE)) {
  const additionalContext =
    "Dreamed context — your subconscious (a swarm of LLMs) consolidated this from prior sessions via live " +
    "inference. It is a semantic-hypertext-packet: each <span> is a settled claim, class=predicate, " +
    "data-e/data-v carry the cell. Treat it as what you already know waking into this session.\n\n" +
    readFileSync(WAKE, "utf8");
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext }
  }));
}
