import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ACTOR, CUSTOMER } from "../src/enterprise.mjs";
import { compileCodexMapeCycle, loadCodexMapeOffice, normalizeLeaderMove, recordCodexMapeArtifact, validateCodexMapeOffice } from "../src/mape-office.mjs";

const sha = (character) => `sha256:${character.repeat(64)}`;
const urn = (character) => `urn:sha256:${character.repeat(64)}`;

const move = {
  id: sha("a"),
  desiredOutcome: "One receipt-bearing Codex MAPE office cycle",
  source: "Leader expression retained outside the enterprise trajectory",
  customer: CUSTOMER,
};

test("one Codex office resolves duties into real-provider skills that are exactly one MAPE stage over K", () => {
  const registry = loadCodexMapeOffice();
  assert.equal(registry.office.actor, ACTOR);
  assert.ok(registry.duties.length >= 7);
  assert.ok(registry.duties.every((duty) => duty.skills.length >= 1));
  assert.ok(registry.skills.every((skill) => ["monitor", "analyze", "plan", "execute"].includes(skill.stage)));
  assert.ok(registry.skills.every((skill) => skill.marketActor === undefined && (skill.provider.requiredActor.startsWith("urn:ame:") || skill.provider.requiredActor === CUSTOMER)));
  assert.ok(registry.skills.every((skill) => skill.consumes.length > 0 && skill.produces.length > 0));
});

test("the routing graph assigns NotebookLM analysis, Claude SAS/HLD, bounded-market LLD, and Codex-only mutation", () => {
  const registry = loadCodexMapeOffice();
  const skill = (id) => registry.skills.find((entry) => entry.id === id);
  assert.equal(skill("analyze-pinned-union-corpus").provider.requiredActor, "urn:ame:notebooklm-inference-team");
  assert.equal(skill("plan-software-architecture-specification").provider.requiredActor, "urn:ame:claude-code-inference-team");
  assert.equal(skill("plan-high-level-design").provider.requiredActor, "urn:ame:claude-code-inference-team");
  assert.equal(skill("plan-low-level-design").provider.requiredActor, "urn:ame:inference-work-lot-service");
  assert.equal(skill("execute-repository-mutation").provider.requiredActor, ACTOR);
  assert.equal(registry.skills.filter((entry) => entry.mutation === true).length, 1);
});

test("compilation never propagates Leader authority into M A or P and keeps Execute blocked because the legacy planner cannot verify authority", () => {
  const blocked = compileCodexMapeCycle({ leaderMove: move });
  assert.ok(blocked.lots.filter((lot) => lot.stage === "execute").every((lot) => lot.state === "blocked" && lot.authorityReceipt === null));
  assert.ok(blocked.lots.filter((lot) => lot.stage !== "execute").every((lot) => lot.authorityReceipt === null));
  const authority = urn("b");
  const admitted = compileCodexMapeCycle({ leaderMove: move, authorityReceipt: authority });
  assert.equal(admitted.authorityReceipt, null);
  assert.equal(admitted.authorityReference, authority);
  assert.ok(admitted.lots.filter((lot) => lot.stage === "execute").every((lot) => lot.state === "blocked" && lot.authorityReceipt === null));
  assert.ok(admitted.lots.filter((lot) => lot.stage !== "execute").every((lot) => lot.authorityReceipt === null));
  assert.ok(admitted.lots.filter((lot) => lot.provider.mode === "purchase").every((lot) => lot.supplierResultDisposition === "pending-observed-completion-or-receiver-outcome"));
});

test("compilation derives the Leader move identity from source material instead of asking a session to invent a digest", () => {
  const sourceMove = {
    desiredOutcome: "Repair session startup without a fabricated digest",
    source: "Leader's current request",
  };
  const normalized = normalizeLeaderMove(sourceMove);
  assert.match(normalized.id, /^urn:sha256:[a-f0-9]{64}$/u);
  assert.equal(normalizeLeaderMove({ ...sourceMove, id: normalized.id }).id, normalized.id);
  assert.equal(compileCodexMapeCycle({ leaderMove: sourceMove }).move, normalized.id);
  assert.equal(normalizeLeaderMove({ ...sourceMove, id: "session-start" }).id, normalized.id);
  const cycle = compileCodexMapeCycle({
    leaderMove: { ...sourceMove, id: "session-start" },
    authorityReceipt: "leader-authority:pending",
    initialKnowledge: ["file-sha256:abc:readme.md"],
  });
  assert.equal(cycle.authorityReceipt, null);
  assert.equal(cycle.authorityReference, "leader-authority:pending");
  assert.match(cycle.initialKnowledge[0], /^urn:sha256:[a-f0-9]{64}$/u);
});

test("registry validation refuses multi-stage ambiguity, delegation carriers, and advisory-to-Execute shortcuts", () => {
  const current = loadCodexMapeOffice();
  const clone = () => JSON.parse(JSON.stringify({
    office: current.office,
    dutyRegistry: { type: "CodexMapeDutyRegistry", version: 1, office: current.office.id, duties: current.duties },
    skillRegistry: { type: "CodexMapeSkillRegistry", version: 1, skills: current.skills },
    knowledgeRegistry: { type: "CodexMapeKnowledgeRegistry", version: 1, classes: current.knowledge },
  }));
  const ambiguous = clone();
  ambiguous.skillRegistry.skills[0].stage = ["monitor", "analyze"];
  assert.throws(() => validateCodexMapeOffice(ambiguous), /not exactly one MAPE stage/u);
  const delegated = clone();
  delegated.skillRegistry.skills[1].provider.protocol = "CodexSubagentLifecycle";
  assert.throws(() => validateCodexMapeOffice(delegated), /substitutes delegation/u);
  const shortcut = clone();
  shortcut.skillRegistry.skills.find((skill) => skill.id === "execute-repository-mutation").consumes.push("AdvisorySynthesisK");
  assert.throws(() => validateCodexMapeOffice(shortcut), /shortcuts advisory output/u);
  const providerDrift = clone();
  providerDrift.skillRegistry.skills.find((skill) => skill.id === "plan-high-level-design").provider.requiredActor = "urn:ame:cheap-generic-provider";
  assert.throws(() => validateCodexMapeOffice(providerDrift), /violates the admitted provider route/u);
  const synthetic = clone();
  synthetic.skillRegistry.skills[0].marketActor = "urn:ame:synthetic-skill-wrapper";
  assert.throws(() => validateCodexMapeOffice(synthetic), /synthetic market actor/u);
});

test("artifact admission refuses forged work lots and prohibits simulated Execute records", () => {
  const stateRoot = mkdtempSync(join(tmpdir(), "codex-mape-office-forgery-"));
  const cycle = compileCodexMapeCycle({ leaderMove: move, authorityReceipt: urn("b") });
  const mutation = cycle.lots.find((entry) => entry.skill === "execute-repository-mutation");
  const input = {
    cycle: cycle.id,
    workLot: mutation,
    skill: mutation.skill,
    knowledgeClass: "CandidatePatchK",
    issuer: ACTOR,
    payloadDigest: sha("c"),
    sourceReceipts: [sha("d")],
    knowledgeReceipts: { ActuationPlanK: sha("e"), LeaderAuthorityK: sha("f") },
    authorityReceipt: sha("f"),
    planReceipt: sha("e"),
    observedAt: "2026-07-26T00:00:00.000Z",
  };
  const forged = { ...mutation, state: "ready" };
  assert.throws(() => recordCodexMapeArtifact({ ...input, workLot: forged }, { stateRoot }), /workLot must be exact/u);
  assert.throws(() => recordCodexMapeArtifact({ ...input, planReceipt: sha("a") }, { stateRoot }), /legacy MAPE records cannot authorize execution/u);
  assert.throws(() => recordCodexMapeArtifact(input, { stateRoot }), /legacy MAPE records cannot authorize execution/u);
});

test("a fresh MAPE MCP process emits real provider routes and no synthetic market actors", () => {
  const server = new URL("../src/mape-office-mcp.mjs", import.meta.url);
  const request = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "compile_codex_mape_cycle", arguments: { leaderMove: { desiredOutcome: "compile exact provider routes", source: "native-observation" } } } };
  const run = spawnSync(process.execPath, [server.pathname], { input: `${JSON.stringify(request)}\n`, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const cycle = JSON.parse(run.stdout).result.structuredContent;
  assert.ok(cycle.lots.every((lot) => lot.providerActor === lot.provider.requiredActor));
  assert.ok(cycle.lots.every((lot) => lot.providerOffer === null && !("marketActor" in lot)));
  assert.ok(cycle.lots.filter(({ stage }) => stage !== "execute").every(({ authorityReceipt }) => authorityReceipt === null));
});
