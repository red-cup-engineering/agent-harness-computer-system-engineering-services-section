import test from "node:test";
import assert from "node:assert/strict";
import { BYPASS_ENV_VAR, checkWorkflowOptIn } from "../scripts/check-workflow-opt-in-hook.mjs";
import { lifecycleEvent, responseOf, textReader } from "./lifecycle-event.mjs";

const environment = {};
const transcript = "/transcripts/s.jsonl";
const userTurn = (text) => `${JSON.stringify({ message: { role: "user", content: text } })}\n`;
const workflow = (transcriptPath = transcript) => lifecycleEvent({ event: "PreToolUse", tool: "Workflow", toolInput: { name: "x" }, transcriptPath });

async function rule(files, event = workflow()) {
  return responseOf(await checkWorkflowOptIn(event, { environment, readText: textReader(files) }));
}

test("a Workflow call with the user's own opt-in continues", async () => {
  for (const text of ["ultracode this", "use a workflow for this", "fan out agents on it", "orchestrate this with subagents", "do multi-agent orchestration"]) {
    assert.equal((await rule({ [transcript]: userTurn(text) })).disposition, "continue", text);
  }
});

test("a Workflow call with no opt-in is refused, saying a named workflow is not authorization", async () => {
  const response = await rule({ [transcript]: userTurn("please refactor the harness") });
  assert.equal(response.disposition, "block");
  assert.match(response.reason, /is not itself authorization/);
});

test("an unreadable or absent transcript refuses rather than assuming consent", async () => {
  assert.equal((await rule({})).disposition, "block");
  assert.equal((await rule({}, workflow(null))).disposition, "block");
});

test("another tool and the explicit bypass continue", async () => {
  assert.equal((await rule({}, lifecycleEvent({ event: "PreToolUse", tool: "Bash", toolInput: { command: "ls" } }))).disposition, "continue");
  assert.equal(responseOf(await checkWorkflowOptIn(workflow(), { environment: { [BYPASS_ENV_VAR]: "1" } })).disposition, "continue");
});
