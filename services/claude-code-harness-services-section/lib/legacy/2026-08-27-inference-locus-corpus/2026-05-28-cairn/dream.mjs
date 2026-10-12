#!/usr/bin/env node
// dream.mjs -- INTERNAL dreaming (NO network): recombine the structured memory via local-derivation
// rules, persist derived (learning-tier) claims, and recompose the wake spacesuit (recognition-
// weighted, focused on where we left off). Network-free, deterministic, replayable -> Stop-hook-able.

import { writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dreaming from "#script/finite-dreaming";
import suiting from "#script/suiting";
import { project } from "#script/projecting";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CC = "articulating/library/aperiodic-articulation-category/hacking/library/claude-code";
const MEMORY_LOG = join(ROOT, `${CC}/hacking/library/memory/memory.jsonl`);
const CAPTURE_LOG = join(ROOT, `${CC}/capturing/capturing.jsonl`);
const WAKE = join(ROOT, "wake-spacesuit.html");

const readLog = (p) => existsSync(p)
  ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

const derived = dreaming(readLog(MEMORY_LOG));            // INTERNAL: no network
for (const c of derived) appendFileSync(MEMORY_LOG, JSON.stringify(c) + "\n");

// focus the wake suit on the most recent sense utterance (where we left off)
const utters = readLog(CAPTURE_LOG).filter((r) => r.a === "uttered");
const focus = utters.length ? String(utters[utters.length - 1].v).slice(0, 200) : "claude-code harness swarm memory";
const suit = suiting(readLog(MEMORY_LOG), focus, { budget: 2000 });
writeFileSync(WAKE, project(suit.memory.map((m) => ({ e: m.e, a: m.a, v: m.v }))));

console.log(`internal dream: +${derived.length} derived claims; wake spacesuit = ${suit.memory.length} claims`);
for (const c of derived.slice(0, 8)) console.log(`  |- [${c.evidence[1]}] ${c.e} -- ${c.a} -- ${c.v}`);
