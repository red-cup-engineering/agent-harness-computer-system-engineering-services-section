/**
 * Read demand: the files the fleet's sessions read, observed from the harness's own hook events.
 *
 * Every harness admits its PreToolUse events to the day's arrival feed, so which files agents read,
 * and in how many distinct sessions, is measured rather than guessed. Each session that reads a file
 * learned it from scratch; the count of those sessions is the demand anchored knowledge answers.
 *
 * A day's log only grows, so each call resumes from a checkpointed cursor instead of re-scanning
 * the whole day: a catch-up subscription, not a rescan. The cursor and the reads folded since the
 * last checkpoint are `read-demand-checkpoint` records of the store, a thread per date.
 */
import path from "node:path";
import { extend, readHead, readLog, walk } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { ARRIVAL_FEED } from "@red-cup-engineering/computer-system-engine/rpc/arrival";
import { hookArrivalOfLine } from "../run-causal-set.mjs";

/** The harness tools whose use is reading one file into the context. */
const READ_TOOLS = new Set(["Read"]);

/** A day's checkpoints are a thread named by the date; each record is the cursor reached and the reads folded since the last. */
const CHECKPOINT_TYPE = "read-demand-checkpoint";
/** The most files one checkpoint record holds, so a catch-up of many files is a few small records. */
const FILES_PER_RECORD = 200;
const CHECKPOINTS_MAX = 4096;

/** A day's checkpoint folded from its thread, or a fresh one at cursor `0` when there is none yet. */
function readCheckpoint(root, date) {
  let cursor = 0;
  const files = new Map();
  for (const step of walk(root, CHECKPOINT_TYPE, readHead(root, CHECKPOINT_TYPE, date)?.frontier ?? [], { limit: CHECKPOINTS_MAX })) {
    const record = step.record;
    if (record === undefined) continue;
    if (Number.isSafeInteger(record.cursor) && record.cursor > cursor) cursor = record.cursor;
    for (const [target, entry] of Object.entries(record.files ?? {})) {
      const seen = files.get(target) ?? { reads: 0, sessions: new Set() };
      if (Number.isSafeInteger(entry?.reads) && entry.reads > 0) seen.reads += entry.reads;
      for (const id of Array.isArray(entry?.sessions) ? entry.sessions : []) if (typeof id === "string") seen.sessions.add(id);
      files.set(target, seen);
    }
  }
  return { cursor, files };
}

/** Record the cursor reached and the reads folded since the last checkpoint. */
function writeCheckpoint(root, date, cursor, delta) {
  const entries = [...delta].map(([target, { reads, sessions }]) => [target, { reads, sessions: [...sessions] }]);
  if (entries.length === 0) { extend(root, CHECKPOINT_TYPE, date, { at: new Date().toISOString(), cursor, files: {} }); return; }
  for (let at = 0; at < entries.length; at += FILES_PER_RECORD) {
    extend(root, CHECKPOINT_TYPE, date, { at: new Date().toISOString(), cursor, files: Object.fromEntries(entries.slice(at, at + FILES_PER_RECORD)) });
  }
}

/**
 * One day's read demand, folded from its checkpoints: arrivals already folded by an earlier call are
 * never re-read, only what the day's log gained since. A day without a log leaves the checkpoints as they were.
 */
function dayReadDemand(root, date) {
  const held = readCheckpoint(root, date);
  let cursor = held.cursor;
  const delta = new Map();
  for (const { line, next } of readLog(root, ARRIVAL_FEED, date, { from: cursor })) {
    cursor = next;
    const envelope = hookArrivalOfLine(root, line)?.envelope;
    if (envelope?.hookEventName !== "PreToolUse" || !READ_TOOLS.has(envelope.toolName)) continue;
    const file = envelope.payload?.tool_input?.file_path;
    if (typeof file !== "string" || file === "") continue;
    const target = path.resolve(typeof envelope.cwd === "string" ? envelope.cwd : "/", file);
    for (const files of [held.files, delta]) {
      const seen = files.get(target) ?? { reads: 0, sessions: new Set() };
      seen.reads += 1;
      if (typeof envelope.sessionId === "string") seen.sessions.add(envelope.sessionId);
      files.set(target, seen);
    }
  }
  if (cursor !== held.cursor) writeCheckpoint(root, date, cursor, delta);
  return held.files;
}

/**
 * The files read in the given days' arrival feeds under a data root, each with its reads and the
 * distinct sessions that read it, most sessions first. A day without a feed contributes nothing.
 */
export function hookReadDemand(root, dates, options = {}) {
  const files = new Map();
  for (const date of dates) {
    for (const [target, seen] of dayReadDemand(root, date)) {
      const held = files.get(target) ?? { reads: 0, sessions: new Set() };
      held.reads += seen.reads;
      for (const session of seen.sessions) held.sessions.add(session);
      files.set(target, held);
    }
  }
  return Object.freeze([...files]
    .map(([file, { reads, sessions }]) => Object.freeze({ path: file, reads, sessions: sessions.size }))
    .sort((left, right) => right.sessions - left.sessions || right.reads - left.reads || left.path.localeCompare(right.path)));
}
