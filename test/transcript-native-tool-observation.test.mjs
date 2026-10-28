import assert from "node:assert/strict";
import test from "node:test";
import { lstatSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import { join } from "node:path";
import { nativeTranscriptFingerprint, observeNativeToolAccounting, projectClaudeToolAccounting, sameNativeTranscript } from "../src/transcripts/native-tool-observation.mjs";

test("a native transcript read is reusable only with complete unchanged identity and mutation coordinates", t => {
  const dir = mkdtempSync(join(scratchRoot(), "transcript-fingerprint-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, "rollout.jsonl"); writeFileSync(file, "original\n");
  const first = nativeTranscriptFingerprint(lstatSync(file));
  assert.equal(sameNativeTranscript(first, nativeTranscriptFingerprint(lstatSync(file))), true);
  writeFileSync(file, "changed source\n");
  assert.equal(sameNativeTranscript(first, nativeTranscriptFingerprint(lstatSync(file))), false);
  const replacement = join(dir, "replacement"); writeFileSync(replacement, "original\n"); renameSync(replacement, file);
  assert.equal(sameNativeTranscript(first, nativeTranscriptFingerprint(lstatSync(file))), false);
  assert.equal(nativeTranscriptFingerprint({ size: first.size }), undefined);
  assert.equal(sameNativeTranscript(first, undefined), false);
  assert.equal(sameNativeTranscript({}, {}), false);
});
test("archived native Codex tool accounting is available from completed carrier evidence without raw text", () => {
  const dir = mkdtempSync(join(scratchRoot(), "harness-native-codex-")); const file = join(dir, "rollout.jsonl");
  const secret = "SECRET_TOOL_RESULT_DO_NOT_RETURN";
  const r = (t,p) => JSON.stringify({timestamp:t, type: p.type==="task_started" || p.type==="task_complete" ? "event_msg":"response_item",payload:p});
  writeFileSync(file,[r("2026-10-22T10:00:00Z",{type:"task_started",turn_id:"t"}),
    r("2026-10-22T10:01:00Z",{type:"function_call",call_id:"a",name:"exec",arguments:secret}),
    r("2026-10-22T10:02:00Z",{type:"function_call_output",call_id:"a",output:secret}),
    r("2026-10-22T10:03:00Z",{type:"task_complete",turn_id:"t"})].join("\n")+"\n");
  const observed = observeNativeToolAccounting({runtime:"codex",evidence:file+"#observed",before:Date.parse("2026-10-22T10:04:00Z")});
  assert.equal(observed.status,"observed");
  assert.equal(observed.accounting.turns[0].counts.calls,1);
  assert.equal(observed.accounting.turns[0].counts.results,1);
  assert.equal(JSON.stringify(observed).includes(secret),false);
  assert.equal(observeNativeToolAccounting({runtime:"codex",evidence:file+"#observed",maxBytes:1}).reason,"bounded-read-exceeded");
  const link=join(dir,"link.jsonl");symlinkSync(file,link);
  assert.equal(observeNativeToolAccounting({runtime:"codex",evidence:link+"#observed"}).reason,"non-regular-file");
});
test("Claude native multi-block tool results, error retries and time frontiers are retained structurally",()=>{
 const secret="DONT_RETURN_PAYLOAD";
 const rows=[
  {type:"assistant",timestamp:"2026-10-22T11:00:00Z",message:{content:[{type:"tool_use",id:"a",name:"Bash",input:secret},{type:"tool_use",id:"b",name:"Read"}]}},
  {type:"user",timestamp:"2026-10-22T11:01:00Z",message:{content:[{type:"tool_result",tool_use_id:"a",is_error:true,content:secret},{type:"tool_result",tool_use_id:"b",content:"ok"}]}},
  {type:"assistant",timestamp:"2026-10-22T11:02:00Z",message:{content:[{type:"tool_use",id:"c",name:"Bash"}]}}
 ];
 const projected=projectClaudeToolAccounting(rows);
 assert.deepEqual([projected.counts.calls,projected.counts.results,projected.counts.failures,projected.counts.retries],[3,2,1,1]);
 assert.equal(JSON.stringify(projected).includes(secret),false);
 const dir=mkdtempSync(join(scratchRoot(),"harness-native-claude-"));const file=join(dir,"session.jsonl");
 writeFileSync(file,rows.map(JSON.stringify).join("\n")+"\n");
 const early=observeNativeToolAccounting({runtime:"claude",evidence:file+"#observed",before:Date.parse("2026-10-22T11:01:00Z")});
 assert.equal(early.accounting.counts.calls,2);
});
