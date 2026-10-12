#!/usr/bin/env node
/**
 * Keep the conversation of every Codex session older than --keep-days in the store, and remove its
 * full rollout only once the archive holds every message read from it.
 *
 * A rollout is mostly tool output (command stdout twice over, MCP results, compacted context). What
 * is kept, per message, as a `codex-transcript` record of the store (`{ session, kind, text, at }`, a long
 * text split into numbered parts) with one `codex-transcript` log line (`{ at, session, kind, of }`) naming it,
 * where `kind` is one of:
 *   codex.session          { cwd, originator, cli_version, source, started, rollout } as `text`
 *   codex.user             the person's messages (injected AGENTS.md and environment blocks are left out; they are re-derivable)
 *   codex.assistant
 *   codex.subagent-prompt  a spawned session's prompt, from the agent that spawned it
 * Each archived rollout is a `codex-rollout-archive` record. Recent sessions stay whole so Codex can resume them.
 *
 *   archive-codex-sessions.mjs --sessions <dir> --root <dir> [--keep-days 14] [--delete]   (paths home-relative unless absolute)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { homedir } from 'node:os';
import { append, each, has, put } from '@red-cup-engineering/semiotic-eavt-services-section/store';

const { values } = parseArgs({ options: {
  sessions: { type: 'string' }, root: { type: 'string' }, 'keep-days': { type: 'string', default: '14' }, delete: { type: 'boolean', default: false },
} });
if (!values.sessions || !values.root) throw new Error('usage: archive-codex-sessions.mjs --sessions <dir> --root <dir> [--keep-days 14] [--delete]');
values.sessions = path.resolve(homedir(), values.sessions);
values.root = path.resolve(homedir(), values.root);
const TRANSCRIPT = 'codex-transcript';
const ARCHIVE = 'codex-rollout-archive';
/** A text's parts, each small enough to sit in one record. */
const PART_CHARACTERS = 16_000;
const partsOf = (text) => { const parts = []; for (let at = 0; at < text.length; at += PART_CHARACTERS) parts.push(text.slice(at, at + PART_CHARACTERS)); return parts.length === 0 ? [''] : parts; };
const cutoff = Date.now() - Number(values['keep-days']) * 86_400_000;
// Blocks Codex injects into the user turn (instructions, context, catalogs): re-derivable, never the person's words.
const INJECTED = /^\s*(# AGENTS\.md instructions|<environment_context>|<user_instructions>|<INSTRUCTIONS>|<permissions instructions>|<recommended_plugins>|<skills_instructions>|<apps_instructions>|<collaboration_mode>|<turn_aborted>)/u;
const textOf = (content, keep = () => true) => (Array.isArray(content) ? content : []).filter((part) => typeof part?.text === 'string' && keep(part.text)).map((part) => part.text).join('\n');

function rolloutsUnder(directory) {
  const out = [];
  const visit = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(full); else if (entry.name.endsWith('.jsonl')) out.push(full);
  } };
  visit(directory);
  return out.sort();
}

async function rowsOf(file) {
  const rows = [], userEvents = [], userItems = [];
  let session = null, subagent = false;
  const lines = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    let record; try { record = JSON.parse(line); } catch { continue; }
    const payload = record.payload ?? {}, t = record.timestamp;
    if (record.type === 'session_meta' && session === null) {
      session = payload.id ?? payload.session_id;
      subagent = payload.thread_source === 'subagent';
      rows.push({ e: session, a: 'codex.session', v: { cwd: payload.cwd ?? null, originator: payload.originator ?? null, cli_version: payload.cli_version ?? null,
        source: payload.source ?? null, started: payload.timestamp ?? t, rollout: path.basename(file) }, t });
    } else if (record.type === 'event_msg' && payload.type === 'user_message' && typeof payload.message === 'string') {
      userEvents.push({ text: payload.message, t });
    } else if (record.type === 'response_item' && payload.type === 'message' && payload.role === 'user') {
      const text = textOf(payload.content, (part) => !INJECTED.test(part));
      if (text) userItems.push({ text, t });
    } else if (record.type === 'response_item' && payload.type === 'message' && payload.role === 'assistant') {
      const text = textOf(payload.content);
      if (text) rows.push({ e: null, a: 'codex.assistant', v: text, t });
    }
  }
  if (session === null) session = path.basename(file, '.jsonl');
  // A rollout that records the typed message as an event also echoes it as an item: the event is the person's own words.
  // A session another agent spawned has no person in it: its user turns are that agent's prompt.
  for (const { text, t } of userEvents.length > 0 ? userEvents : userItems) rows.push({ e: null, a: subagent ? 'codex.subagent-prompt' : 'codex.user', v: text, t });
  for (const row of rows) row.e ??= session;
  return rows.sort((x, y) => String(x.t).localeCompare(String(y.t)));
}

/** Put one row's records and log lines; returns the addresses of the records. */
function keepRow(row) {
  const at = new Date(row.t).toISOString();
  const kind = row.a;
  const text = typeof row.v === 'string' ? row.v : JSON.stringify(row.v);
  const parts = partsOf(text);
  return parts.map((part, index) => {
    const of = put(values.root, TRANSCRIPT, { session: row.e, kind, at, text: part, ...(parts.length > 1 ? { part: index, parts: parts.length } : {}) });
    append(values.root, TRANSCRIPT, { at, session: row.e, kind, of, ...(parts.length > 1 ? { part: index } : {}) });
    return of;
  });
}

const done = new Set([...each(values.root, ARCHIVE)].map(({ record }) => record.rollout));
const summary = { archived: 0, alreadyArchived: 0, rows: 0, rolloutBytes: 0, deleted: 0, deletedBytes: 0, refused: [] };
const expected = []; // every record this run wrote: each must be held before any rollout goes
const pending = [];
for (const file of rolloutsUnder(values.sessions)) {
  const stat = fs.statSync(file);
  if (stat.mtimeMs >= cutoff) continue;
  const rel = path.relative(values.sessions, file);
  if (done.has(rel)) { summary.alreadyArchived += 1; pending.push({ file, rel, size: stat.size }); continue; }
  try {
    const rows = await rowsOf(file);
    for (const row of rows) expected.push(...keepRow(row));
    put(values.root, ARCHIVE, { rollout: rel, rows: rows.length, bytes: stat.size, at: new Date().toISOString() });
    summary.archived += 1; summary.rows += rows.length; summary.rolloutBytes += stat.size;
    pending.push({ file, rel, size: stat.size });
  } catch (error) { summary.refused.push({ rel, error: error.message }); }
}
// The store holds every record this run wrote before any rollout goes.
for (const address of expected) {
  if (!has(values.root, TRANSCRIPT, address)) throw new Error(`${address} is not held; nothing is deleted`);
}
if (values.delete) for (const { file, size } of pending) { fs.rmSync(file); summary.deleted += 1; summary.deletedBytes += size; }
console.log(JSON.stringify(summary));
