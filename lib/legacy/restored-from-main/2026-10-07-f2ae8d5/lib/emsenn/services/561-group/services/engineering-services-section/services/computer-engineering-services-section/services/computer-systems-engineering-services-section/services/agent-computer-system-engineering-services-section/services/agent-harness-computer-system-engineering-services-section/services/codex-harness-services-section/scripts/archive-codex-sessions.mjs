#!/usr/bin/env node
/**
 * Keep the conversation of every Codex session older than --keep-days as SEAVT rows, and remove its
 * full rollout only once the archive holds every message read from it.
 *
 * A rollout is mostly tool output (command stdout twice over, MCP results, compacted context). What
 * is kept, per session, in the `codex-transcripts` feed (<root>/data/logs/YYYY/MM/DD/codex-transcripts.jsonl):
 *   { e: session, a: "codex.session",   v: { cwd, originator, cli_version, source, started, rollout }, t }
 *   { e: session, a: "codex.user",      v: text, t }   the person's messages (injected AGENTS.md and
 *                                                       environment blocks are left out; they are re-derivable)
 *   { e: session, a: "codex.assistant", v: text, t }
 *   { e: session, a: "codex.subagent-prompt", v: text, t }   a spawned session's prompt, from the agent that spawned it
 * Closed days are packed (seekable zstd). Recent sessions stay whole so Codex can resume them.
 *
 *   archive-codex-sessions.mjs --sessions <dir> --root <dir> [--keep-days 14] [--delete]   (paths home-relative unless absolute)
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';
import { homedir } from 'node:os';
import { openSegmentReader, packSegment } from '@red-cup-engineering/semiotic-eavt-services-section/journal/filesystem/segment-bytes';

const { values } = parseArgs({ options: {
  sessions: { type: 'string' }, root: { type: 'string' }, 'keep-days': { type: 'string', default: '14' }, delete: { type: 'boolean', default: false },
} });
if (!values.sessions || !values.root) throw new Error('usage: archive-codex-sessions.mjs --sessions <dir> --root <dir> [--keep-days 14] [--delete]');
values.sessions = path.resolve(homedir(), values.sessions);
values.root = path.resolve(homedir(), values.root);
const FEED = 'codex-transcripts';
const mark = (value) => ['mark', JSON.stringify(value)];
const logFile = (day) => path.join(values.root, 'data', 'logs', ...day.split('-'), `${FEED}.jsonl`);
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
      rows.push({ e: mark(session), a: mark('codex.session'), v: mark({ cwd: payload.cwd ?? null, originator: payload.originator ?? null, cli_version: payload.cli_version ?? null,
        source: payload.source ?? null, started: payload.timestamp ?? t, rollout: path.basename(file) }), t });
    } else if (record.type === 'event_msg' && payload.type === 'user_message' && typeof payload.message === 'string') {
      userEvents.push({ text: payload.message, t });
    } else if (record.type === 'response_item' && payload.type === 'message' && payload.role === 'user') {
      const text = textOf(payload.content, (part) => !INJECTED.test(part));
      if (text) userItems.push({ text, t });
    } else if (record.type === 'response_item' && payload.type === 'message' && payload.role === 'assistant') {
      const text = textOf(payload.content);
      if (text) rows.push({ e: null, a: mark('codex.assistant'), v: mark(text), t });
    }
  }
  if (session === null) session = path.basename(file, '.jsonl');
  // A rollout that records the typed message as an event also echoes it as an item: the event is the person's own words.
  // A session another agent spawned has no person in it: its user turns are that agent's prompt.
  for (const { text, t } of userEvents.length > 0 ? userEvents : userItems) rows.push({ e: null, a: mark(subagent ? 'codex.subagent-prompt' : 'codex.user'), v: mark(text), t });
  for (const row of rows) row.e ??= mark(session);
  return rows.sort((x, y) => String(x.t).localeCompare(String(y.t)));
}

const lineCount = (file) => {
  if (!fs.existsSync(file)) return 0;
  const reader = openSegmentReader(file), size = fs.statSync(file).size, buffer = Buffer.alloc(1 << 20);
  let n = 0;
  try { for (let at = 0; at < size;) { const got = reader.read(buffer, 0, Math.min(buffer.length, size - at), at); if (!got) break; for (let i = 0; i < got; i += 1) if (buffer[i] === 10) n += 1; at += got; } }
  finally { reader.close(); }
  return n;
};

const manifest = path.join(values.root, 'archived-rollouts.jsonl');
const done = new Set(fs.existsSync(manifest) ? fs.readFileSync(manifest, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).rollout) : []);
const summary = { archived: 0, alreadyArchived: 0, rows: 0, rolloutBytes: 0, deleted: 0, deletedBytes: 0, refused: [] };
const expected = new Map(); // day log -> rows it must hold after this run
const pending = [];
for (const file of rolloutsUnder(values.sessions)) {
  const stat = fs.statSync(file);
  if (stat.mtimeMs >= cutoff) continue;
  const rel = path.relative(values.sessions, file);
  if (done.has(rel)) { summary.alreadyArchived += 1; pending.push({ file, rel, size: stat.size }); continue; }
  try {
    const rows = await rowsOf(file);
    const byDay = new Map();
    for (const row of rows) { const day = String(row.t).slice(0, 10); if (!byDay.has(day)) byDay.set(day, []); byDay.get(day).push(JSON.stringify(row)); }
    for (const [day, lines] of byDay) {
      const log = logFile(day);
      fs.mkdirSync(path.dirname(log), { recursive: true });
      const before = expected.get(log) ?? lineCount(log);
      fs.appendFileSync(log, `${lines.join('\n')}\n`);
      expected.set(log, before + lines.length);
    }
    fs.appendFileSync(manifest, `${JSON.stringify({ rollout: rel, rows: rows.length, bytes: stat.size, at: new Date().toISOString() })}\n`);
    summary.archived += 1; summary.rows += rows.length; summary.rolloutBytes += stat.size;
    pending.push({ file, rel, size: stat.size });
  } catch (error) { summary.refused.push({ rel, error: error.message }); }
}
// Every day log holds at least what this run appended to it before any rollout goes.
for (const [log, count] of expected) {
  const held = lineCount(log);
  if (held < count) throw new Error(`${log} holds ${held} rows, not the ${count} written; nothing is deleted`);
}
// Pack every day before today (all appends of this run are done).
const today = new Date().toISOString().slice(0, 10);
const logs = path.join(values.root, 'data', 'logs');
let packed = 0;
for (const year of fs.existsSync(logs) ? fs.readdirSync(logs) : []) for (const month of fs.readdirSync(path.join(logs, year))) for (const date of fs.readdirSync(path.join(logs, year, month))) {
  const day = `${year}-${month}-${date}`;
  if (day < today && fs.existsSync(logFile(day)) && !packSegment(logFile(day)).unchanged) packed += 1;
}
summary.packedDays = packed;
if (values.delete) for (const { file, size } of pending) { fs.rmSync(file); summary.deleted += 1; summary.deletedBytes += size; }
console.log(JSON.stringify(summary));
