import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scratchRoot } from "./support/scratch.mjs";
import { appendHookEventAtRoot } from "../src/hooks/service.mjs";
import { get, readHead } from "@red-cup-engineering/semiotic-eavt-services-section/store";

const usage = n => JSON.stringify({ type: "event_msg", timestamp: "2026-10-28T10:00:00Z", payload: {
  type: "token_count", info: { total_token_usage: { input_tokens: n, output_tokens: 2, total_tokens: n + 2 },
    last_token_usage: { input_tokens: n, output_tokens: 2, total_tokens: n + 2 } } } }) + "\n";

test("native token checkpoints skip unchanged reads and remeasure rewritten or replaced usage", t => {
  const root = mkdtempSync(join(scratchRoot(), "token-checkpoint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const transcript = join(root, "session.jsonl");
  let reads = 0, tick = 0;
  const admit = (session = "fixture-session") => appendHookEventAtRoot(root,
    { hook_event_name: "Stop", session_id: session, transcript_path: transcript }, {
      harness: "codex", at: `2026-10-28T10:00:${String(tick++).padStart(2, "0")}Z`, admitTokenUsage: true,
      statPathOrNull: file => { try { return statSync(file); } catch { return null; } },
      readFileUtf8: file => { reads++; return readFileSync(file, "utf8"); },
    });
  const total = (session = "fixture-session") => {
    const head = readHead(root, "session-token-usage", session);
    assert.ok(head?.frontier.length, "the original hook must admit a native usage summary");
    return get(root, "session-token-usage", head.frontier[0]).v.total.inputTokens;
  };
  writeFileSync(transcript, usage(10)); admit(); assert.equal(total(), 10);
  admit(); assert.equal(reads, 1, "unchanged input must not be read again");
  writeFileSync(transcript, usage(10) + usage(20)); admit(); assert.equal(total(), 30);
  // Same inode, increased size, same event row numbers: size alone cannot qualify an append.
  writeFileSync(transcript, usage(100) + usage(300) + JSON.stringify({ ignored: "growth" }) + "\n");
  admit(); assert.equal(total(), 400); admit(); assert.equal(reads, 3);
  writeFileSync(transcript, usage(500) + usage(700) + JSON.stringify({ ignored: "growth" }) + "\n");
  admit(); assert.equal(total(), 1200);
  writeFileSync(transcript, usage(5)); admit(); assert.equal(total(), 5);
  const replacement = join(root, "replacement"); writeFileSync(replacement, usage(8)); renameSync(replacement, transcript);
  admit(); assert.equal(total(), 8);
  admit("another-session"); assert.equal(total("another-session"), 8);
  writeFileSync(transcript, ""); admit("another-session"); assert.equal(total("another-session"), undefined);
});
