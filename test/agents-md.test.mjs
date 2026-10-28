// agents-md.test: AGENTS.md is generated from records alone (rule agents-md-is-generated-from-records). The records
// here are a small fake section; every word the tests expect in the output is written into those records.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readProjection, renderAgentsMd, spell } from "../src/agents-md.mjs";
import { scratchRoot } from "./support/scratch.mjs";

const scratch = mkdtempSync(path.join(scratchRoot(), "agents-md-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
const SCRIPT = fileURLToPath(new URL("../scripts/write-agents-md.mjs", import.meta.url));
const writeJson = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

const LONG = `A session MUST carry routine work through to its receiver. ${"An incident is Done only when its underlying conditions are gone. ".repeat(12)}Containment is never the fix.`;

/** A section root holding a projection record and the records it names. */
function fakeSection(name, { rules = ["long", "short"], extraLayout = {} } = {}) {
  const root = path.join(scratch, name);
  writeJson(path.join(root, "rules/long.json"), { id: "long", statement: LONG });
  writeJson(path.join(root, "rules/short.json"), { id: "short", statement: "A session MUST name things plainly." });
  writeJson(path.join(root, "requirements/zero-cash.json"), { id: "zero-cash", name: "Zero cash", budget: { cash: "zero", card: { admitted: "payment information only" } } });
  writeJson(path.join(root, "queue.json"), { items: [{ id: "seed", state: "open" }, { id: "card", state: "deferred by the Leader" }, { id: "old", state: "done" }] });
  const record = path.join(root, "projection.json");
  writeJson(record, {
    id: "agent-session-projection",
    rules: [{ topic: "Authority", items: rules }],
    requirements: [{ id: "zero-cash", topic: "Cash" }],
    "decision-queue": "queue.json",
    carriers: [{ repo: "org/campaign", number: 390, binds: "zero-cash compute" }],
    "agents-md": {
      preamble: ["# AGENTS.md", "", "Generated from projection.json."],
      "rule-directory": "rules",
      "requirement-directory": "requirements",
      "problems-heading": "Projection problems",
      sections: [
        { heading: "Rules", from: "rules" },
        { heading: "Decisions", from: "requirements" },
        { heading: "Waiting", text: "Queue it; do not ask twice.", from: "decision-queue" },
        { heading: "Carriers", from: "carriers" },
        { heading: "Checklist", from: "list", items: ["Read the rule by id.", "Read the decision queue."] },
      ],
      ...extraLayout,
    },
  });
  return { root, record };
}

test("spell writes nested record values out instead of [object Object]", () => {
  assert.equal(spell({ admitted: "payment information only", source: { by: "Leader" } }), "admitted payment information only, source by Leader");
  assert.equal(spell(0), "0");
});

test("every section comes from its record, in the layout's order, and no statement is clipped", () => {
  const { root, record } = fakeSection("whole");
  const text = renderAgentsMd(readProjection({ record, root }));
  assert.ok(text.startsWith("# AGENTS.md\n\nGenerated from projection.json.\n\n## Rules\n\n### Authority\n\n"));
  assert.ok(text.includes(`- [long] ${LONG}`), "the whole rule statement reaches the file");
  assert.match(text, /Containment is never the fix\./u);
  assert.match(text, /- Cash: cash zero; card admitted payment information only \[requirement zero-cash\]/u);
  assert.match(text, /## Waiting\n\nQueue it; do not ask twice\.\n\n- card: deferred by the Leader\n- seed\n/u);
  assert.doesNotMatch(text, /- old/u);
  assert.match(text, /- org\/campaign#390: zero-cash compute/u);
  assert.match(text, /1\. Read the rule by id\.\n2\. Read the decision queue\.\n$/u);
  assert.doesNotMatch(text, /object Object|Projection problems/u);
});

test("a rule the record names and the store lacks is reported in the file, not dropped silently", () => {
  const { root, record } = fakeSection("missing", { rules: ["short", "absent"] });
  const text = renderAgentsMd(readProjection({ record, root }));
  assert.match(text, /## Projection problems\n\n- rule absent is named by projection\.json and not found in rules\n$/u);
});

test("a layout missing a field or drawing on an unknown source is refused, not filled with defaults", () => {
  const { root, record } = fakeSection("bad-layout", { extraLayout: { "rule-directory": undefined } });
  assert.throws(() => readProjection({ record, root }), /lacks rule-directory/u);
  const unknown = fakeSection("unknown-source", { extraLayout: { sections: [{ heading: "X", from: "gossip" }] } });
  assert.throws(() => renderAgentsMd(readProjection(unknown)), /unknown source gossip/u);
});

test("the script writes the same bytes to every target and refuses missing parameters", () => {
  const { root, record } = fakeSection("script");
  const targets = [path.join(root, "AGENTS.md"), path.join(root, "nested-AGENTS.md")];
  const run = spawnSync(process.execPath, [SCRIPT, "--projection", record, "--root", root, ...targets.flatMap((target) => ["--write", target])], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const [first, second] = targets.map((target) => readFileSync(target, "utf8"));
  assert.equal(first, second);
  assert.equal(first, renderAgentsMd(readProjection({ record, root })));
  const refused = spawnSync(process.execPath, [SCRIPT, "--projection", record], { encoding: "utf8" });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /name --root, --write/u);
});
