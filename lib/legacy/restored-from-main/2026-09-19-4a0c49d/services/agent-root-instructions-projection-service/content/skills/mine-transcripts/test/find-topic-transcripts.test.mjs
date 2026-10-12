import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  extractSnippet,
  intersectAll,
  listCodexFiles,
  listJsonlFiles,
  listSubagentFiles,
  parseArgs,
  searchBucket,
} from "../scripts/find-topic-transcripts.mjs";

// Regression fixture for the noise-line bug found 2026-08-31: a Codex
// "encrypted_content" reasoning line and a Claude "signature" thinking line
// can coincidentally contain a short search term inside their base64
// payload. Neither is human-authored text; a file with ONLY such a
// coincidental hit must not be counted as matching the term, and a file
// with a real hit must still rank on that real hit alone.

test("parseArgs requires at least one term", () => {
  assert.throws(() => parseArgs([]), /At least one --term is required/u);
});

test("parseArgs rejects an unknown harness", () => {
  assert.throws(() => parseArgs(["--term", "relationality", "--harness", "vps"]), /--harness must be/u);
});

test("intersectAll narrows to files present in every set, order-independent", () => {
  const result = intersectAll([new Set(["a", "b", "c"]), new Set(["b", "c", "d"]), new Set(["c", "b"])]);
  assert.deepEqual([...result].sort(), ["b", "c"]);
});

test("intersectAll of zero sets is empty", () => {
  assert.deepEqual([...intersectAll([])], []);
});

test("listJsonlFiles finds only top-level .jsonl, listSubagentFiles finds only nested subagents/*.jsonl", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "topic-search-"));
  try {
    await writeFile(path.join(directory, "root-a.jsonl"), "");
    await writeFile(path.join(directory, "not-a-transcript.txt"), "");
    await mkdir(path.join(directory, "root-a", "subagents"), { recursive: true });
    await writeFile(path.join(directory, "root-a", "subagents", "agent-1.jsonl"), "");

    const rootFiles = await listJsonlFiles(directory);
    assert.deepEqual(rootFiles, [path.join(directory, "root-a.jsonl")]);

    const subagentFiles = await listSubagentFiles(directory);
    assert.deepEqual(subagentFiles, [{ file: path.join(directory, "root-a", "subagents", "agent-1.jsonl"), rootSessionId: "root-a" }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("listCodexFiles walks date-sharded directories", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "topic-search-codex-"));
  try {
    const shard = path.join(directory, "2026", "08", "31");
    await mkdir(shard, { recursive: true });
    await writeFile(path.join(shard, "rollout-x.jsonl"), "");
    const files = await listCodexFiles(directory);
    assert.deepEqual(files, [path.join(shard, "rollout-x.jsonl")]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("searchBucket narrows to files matching every term and ranks by match density", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "topic-search-rank-"));
  try {
    const dense = path.join(directory, "dense.jsonl");
    const sparse = path.join(directory, "sparse.jsonl");
    const offTopic = path.join(directory, "off-topic.jsonl");
    await writeFile(dense, "relationality predication\nrelationality predication\nrelationality predication\n");
    await writeFile(sparse, "relationality predication\n");
    await writeFile(offTopic, "relationality only, no second term\n");

    const result = await searchBucket("test-bucket", [dense, sparse, offTopic], ["relationality", "predication"], {
      limit: 10,
      snippetChars: 80,
    });

    assert.equal(result.searched, 3);
    assert.equal(result.matchedCount, 2);
    assert.equal(result.truncated, false);
    assert.deepEqual(result.ranked.map((entry) => entry.file), [dense, sparse]);
    assert.ok(result.ranked[0].total > result.ranked[1].total);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("extractSnippet pulls the matching string out of a JSONL record instead of printing raw JSON from the line start", () => {
  const line = JSON.stringify({
    type: "user",
    message: { role: "user", content: "we keep circling back to relationality as the predication substrate" },
  });
  const snippet = extractSnippet(line, "relationality", 40);
  assert.ok(snippet.includes("relationality"));
  assert.ok(!snippet.startsWith("{\"type\""));
});

test("extractSnippet falls back to the raw line when no field contains the term", () => {
  const line = JSON.stringify({ type: "user", message: { role: "user", content: "unrelated content" } });
  const snippet = extractSnippet(line, "relationality", 40);
  assert.ok(snippet.length > 0);
});

test("searchBucket ignores term hits that fall only inside base64 noise fields (encrypted_content, signature)", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "topic-search-noise-"));
  try {
    const noiseOnlyCodex = path.join(directory, "noise-only-codex.jsonl");
    const noiseOnlyClaude = path.join(directory, "noise-only-claude.jsonl");
    const realHit = path.join(directory, "real-hit.jsonl");
    // "gAAmudAAA..." — a base64-shaped run that happens to contain "mud".
    await writeFile(
      noiseOnlyCodex,
      `${JSON.stringify({ type: "response_item", payload: { type: "reasoning", encrypted_content: "gAAAAABqjyT5IfEKAV0FgAAmudAAAAAiKrhNaBiCA" } })}\n`,
    );
    await writeFile(
      noiseOnlyClaude,
      `${JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "thinking", thinking: "reasoning text", signature: "CAIS1gsKgAAmudAAAAKpwEIERgCKkCQMs8n" }] } })}\n`,
    );
    await writeFile(realHit, "we already have MUD engines, TAB's thing-model is...\n");

    const result = await searchBucket("noise-test", [noiseOnlyCodex, noiseOnlyClaude, realHit], ["mud"], {
      limit: 10,
      snippetChars: 80,
    });

    // matchedCount is the fast coarse pass (unfiltered grep -l) and still
    // counts the two noise-only files — that discrepancy is documented, not
    // hidden. The ranked list is what a session actually reads, and it must
    // exclude both: noise-filtered per-file counts score them 0.
    assert.equal(result.matchedCount, 3);
    assert.deepEqual(result.ranked.map((entry) => entry.file), [realHit]);
    assert.ok(result.ranked[0].snippet.toLowerCase().includes("mud"));
    assert.ok(!result.ranked[0].snippet.includes("gAAAAAB"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("searchBucket reports truncation instead of ranking past the cap", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "topic-search-cap-"));
  try {
    const files = [];
    for (let index = 0; index < 3; index += 1) {
      const file = path.join(directory, `f${index}.jsonl`);
      await writeFile(file, "shared-term\n");
      files.push(file);
    }
    const result = await searchBucket("capped", files, ["shared-term"], { limit: 10, snippetChars: 80, rankCap: 2 });
    assert.equal(result.truncated, true);
    assert.equal(result.matchedCount, 3);
    assert.deepEqual(result.ranked, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
