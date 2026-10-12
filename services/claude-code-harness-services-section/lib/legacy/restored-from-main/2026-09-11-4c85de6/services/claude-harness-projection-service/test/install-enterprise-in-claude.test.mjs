import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installEnterpriseInClaude, renderEnterpriseStandingBlock } from "../src/install-enterprise-in-claude.mjs";

const instruments = ["project-a-skill.js", "write-a-schema.js", "write-an-office.js", "make-a-task.js", "dispatch-a-task.js", "list-open-obligations.js"];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "enterprise-installer-"));
  const enterprise = join(root, "node/lib/management");
  mkdirSync(join(root, "node/content/offices"), { recursive: true });
  mkdirSync(join(enterprise, "skills"), { recursive: true });
  for (const name of instruments) writeFileSync(join(enterprise, "skills", name), "");
  const office = { id: "verifier", record: join(root, "node/content/offices/verifier.json") };
  writeFileSync(office.record, JSON.stringify({ kind: "office", "normative-structure": "Verifies a completed work product.", "bears-duty": ["emsenn/duty/attesting-a-work-product"] }));
  return { root, enterprise, office };
}

test("renders the frozen standing-block projection byte-for-byte for a representative roster", () => {
  const { root, enterprise, office } = fixture();
  try {
    const block = renderEnterpriseStandingBlock({ enterprise, offices: [office], repoRoot: root });
    assert.equal(block, `<!-- installing-an-enterprise-in-claude: begin -->\n# This node holds an enterprise\n\nThe enterprise seats at \`node/lib/management\`. Every office on its roster is\ninstalled at this node as a subagent — one file per office under \`.claude/agents/\` —\nand the session opened here holds NO office itself. It is the dispatcher: it decides\nwhere work goes, and it does not do the offices' work.\n\n## Classes and instances are never the same record\n\nA CLASS says what a kind of record must look like: one JSON Schema per type,\nseated in \`node/lib/schemas/\` ($node/lib). An INSTANCE is a particular thing —\none office, one task, one dispatch — a plain \`<id>.json\` record seated in\n\`node/content/<pool>/\` ($node/content), validated against its class and never\nitself a schema. No record is ever both: an instance carries no \`$schema\` and\nno \`$id\`, and a class constrains records without being one. A term in the\nglossary is an instance too — a definition entry, not a schema.\n\n## The enterprise membrane\n\nProtocol scale is not interchangeable. A2A is the coordination face among offices\nand agents within this enterprise. ActivityPub is the messaging face between this\nsovereign enterprise and another one. Receiving an ActivityPub message may create\nlocal work only through this enterprise's own admission and authority; a sender\nnever writes this enterprise's pools. No umbrella platform participates in this\nboundary; each required faculty is hired from its sovereign owner.\n\n## The delegation rule\n\nWork belongs to the office that owes it — delegate to the installed agent rather\nthan doing an office's work at the root. And records are written by the\nenterprise's instruments, never by hand:\n\n- a skill is one flat script in \`node/lib/management/skills/\`, projected by \`node/lib/management/skills/project-a-skill.js\`\n- a class (schema) is written by \`node/lib/management/skills/write-a-schema.js\`\n- an office by \`node/lib/management/skills/write-an-office.js\`\n- a task by \`node/lib/management/skills/make-a-task.js\`\n- a dispatch by \`node/lib/management/skills/dispatch-a-task.js\`\n\n## The obligation loop\n\n"Fulfill the obligations of your office" resolves here with no other context:\n\n1. At session start, from the repository root, run\n   \`node node/lib/management/skills/list-open-obligations.js --pool node/content/dispatches --root .\`.\n   It reads the enterprise's dispatch board and derives which dispatches are\n   OPEN — a dispatch is open while its task's goal is unachieved, and achievement\n   is derived by re-running the goal, never read from any record.\n2. Work each open dispatch by delegating its task to the office named on the\n   dispatch.\n3. The worker never verifies its own work. Attestation belongs to\n   verifier (attesting-a-work-product), and\n   \`node node/lib/management/skills/make-a-task.js --verify <task> --pool node/content/tasks --root .\`\n   is the witness's instrument.\n\n## The roster\n\n- **verifier** — Verifies a completed work product.\n<!-- installing-an-enterprise-in-claude: end -->\n`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("list mode requires authority before it can make an effect", async () => {
  const before = process.exitCode;
  await assert.rejects(() => installEnterpriseInClaude({ argv: [process.execPath, "installer", "--list"], cwd: process.cwd() }), /--authority-root must be supplied exactly once/);
  assert.equal(process.exitCode, before);
});
