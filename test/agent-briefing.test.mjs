import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { projectAgentBriefing } from "../src/agent-briefing.mjs";

function agencyFixture() {
  const root = mkdtempSync(join(tmpdir(), "agent-briefing-"));
  const section = join(root, "shop-services-section");
  const pool = (name) => { const dir = join(section, "lib/agency", name); mkdirSync(dir, { recursive: true }); return dir; };
  mkdirSync(section, { recursive: true });
  writeFileSync(join(section, "README.md"), "# Shop\n\nThe shop sells bound books.\n");
  writeFileSync(join(pool("offices"), "owner.json"), JSON.stringify({ id: "owner", name: "shop owner", kind: "office", "normative-structure": "The owner answers for the shop.", "deontic-profile": { "answering-mail": "duty" } }));
  writeFileSync(join(pool("duties"), "answering-mail.json"), JSON.stringify({ id: "answering-mail", name: "answering mail", skills: ["running-the-shop"], "required-act-or-state": "Answer every letter.", "receiver-condition": "No letter waits a week.", correlative: "the letter writer", "required-evidence": ["the sent reply"], "effect-limits": ["no promise of refunds"], "ceo-board-relation": "The board receives the monthly count.", "x-provenance": { source: "shop-services-section/notes/mail.md" } }));
  mkdirSync(join(pool("skills"), "running-the-shop"), { recursive: true });
  writeFileSync(join(pool("skills"), "running-the-shop", "SKILL.md"), "---\nname: running-the-shop\ndescription: Run the shop.\ntype: skill\nrequires-capabilities:\n  - work-item\n---\n\n# Run the shop\n\nRead the mail first.\n");
  writeFileSync(join(pool("incumbencies"), "owner-as-pat.json"), JSON.stringify({ id: "owner-as-pat", office: "owner", holder: "password:pat", recognition: "t", induction: "t" }));
  return root;
}

test("a briefing carries the principal's office, its duties with their notes, powers, skills and connection", (t) => {
  const root = agencyFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const briefing = projectAgentBriefing({ agencyRoot: root, holder: "password:pat", principal: "Pat", instance: { name: "ops.shop.test", title: "Shop operations", origin: "https://ops.shop.test" } });
  assert.deepEqual(briefing.obstructions, []);
  assert.deepEqual(briefing.offices, ["owner"]);
  assert.ok(!briefing.markdown.includes("Read the mail first."), "a skill is named by reference, its body is not inlined");
  for (const expected of ["The shop sells bound books.", "The owner answers for the shop.", "Answer every letter.", "No letter waits a week.", "Received by: the letter writer", "Evidence: the sent reply.", "Limits: no promise of refunds.", "CEO and Board: The board receives the monthly count.", "shop-services-section/notes/mail.md", "`work-item`", "**running-the-shop** — Run the shop.", "Load: `read shop-services-section#running-the-shop` or `shop-services-section/lib/agency/skills/running-the-shop/SKILL.md`", "https://ops.shop.test/mcp"]) {
    assert.ok(briefing.markdown.includes(expected), `briefing lacks ${expected}`);
  }
});

test("a holder with no seat is an obstruction, not an empty briefing passed off as whole", (t) => {
  const root = agencyFixture();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const briefing = projectAgentBriefing({ agencyRoot: root, holder: "password:nobody", principal: "Nobody", instance: { name: "ops.shop.test", title: "Shop operations", origin: "https://ops.shop.test" } });
  assert.equal(briefing.offices.length, 0);
  assert.equal(briefing.obstructions.length, 1);
});
