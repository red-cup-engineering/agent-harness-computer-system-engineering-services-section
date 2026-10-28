import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { schemaById, schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { agencyWorkAllocationSchema, agencyWorkAllocationContract } from "@red-cup-engineering/organizing/work/schema";
import { AGENCY_OUTCOME_SHAPE } from "../src/carrier/agency-carrier.mjs";
import { carrierSourceTask } from "../src/carrier/workspace.mjs";
import { codexNodeRoot } from "../services/codex-harness-services-section/src/operations.mjs";

test("native harness carriers retain current Work meaning and refuse ambiguous schema resolution", () => {
  assert.equal(typeof carrierSourceTask, "function");
  assert.match(AGENCY_OUTCOME_SHAPE, /skillOutcome/u);
  assert.equal(schemaFrom(agencyWorkAllocationSchema), agencyWorkAllocationContract);
  const allocation = { kind: "metroplat.work.agency-work-allocation", id: "fixture:allocation",
    subject: "fixture:holder", office: { id: "fixture:office" }, duty: "emsenn/duty/fixture-reading",
    character: { id: "fixture:character", capabilities: [], realization: { kind: "operation", version: 1,
      operation: semanticId("fixture:operation"), signature: semanticId("fixture:signature"),
      qualification: semanticId("fixture:qualification") } },
    officeService: { id: "fixture:service", requiredCapabilities: [] }, allocation: { scope: "task:fixture" } };
  assert.doesNotThrow(() => agencyWorkAllocationContract.assert(allocation));
  assert.throws(() => agencyWorkAllocationContract.assert({ ...allocation,
    character: { ...allocation.character, model: "fixture:model" } }), /schema|match|valid/u);
  const competing = schemaFrom({ $id: agencyWorkAllocationContract.id, type: "null" });
  assert.throws(() => schemaById(agencyWorkAllocationContract.id), /declared 2 different ways/u);
  const implicit = schemaFrom({ $id: "test/harness/cohort-implicit", $ref: agencyWorkAllocationContract.id });
  assert.throws(() => implicit.validate(allocation), /declared 2 different ways/u);
  assert.throws(() => schemaFrom({ $ref: agencyWorkAllocationContract.id }, [agencyWorkAllocationContract, competing]),
    /different contracts share reference address/u);
  const explicit = schemaFrom({ $id: "test/harness/cohort-explicit", $ref: agencyWorkAllocationContract.id }, [agencyWorkAllocationContract]);
  assert.equal(explicit.references[0], agencyWorkAllocationContract);
  assert.equal(explicit.validate(allocation), true);
  assert.equal(explicit.validate(null), false);
  assert.equal(schemaFrom(agencyWorkAllocationSchema), agencyWorkAllocationContract,
    "competing declarations leave the original contract identity intact");
});

test("the original Codex node binding receives the host's named enterprise section", t => {
  const root = mkdtempSync(path.join(scratchRoot(), "harness-cohort-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const section = "codex-services-section";
  const pool = path.join(root, section, "lib", "agency", "enterprises");
  mkdirSync(pool, { recursive: true });
  writeFileSync(path.join(pool, "codex-node.json"), JSON.stringify({ id: "codex-node", kind: "enterprise", name: "Fixture Codex" }));
  const environment = { METROPLAT_AGENCY_SECTIONS: JSON.stringify([section]), METROPLAT_SETTLEMENTS_ROOT: path.join(root, "settlements") };
  assert.equal(codexNodeRoot({ agencyRoot: root, environment }), path.join(root, "settlements", "codex-node"));
  assert.throws(() => codexNodeRoot({ agencyRoot: root, agencySections: [], environment }), /no codex-node enterprise/u);
});
