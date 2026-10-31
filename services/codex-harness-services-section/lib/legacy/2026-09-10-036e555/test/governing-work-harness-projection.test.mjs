import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { installHarness } from "../scripts/project-codex-agent-harness.mjs";
import { loadGoverningWorkDefinitionReadModel } from "@red-cup-engineering/governing-work-computer-system-engineering-services-section";

function repositoryRootFromPackage() {
  let current = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  while (!existsSync(join(current, ".git"))) current = dirname(current);
  return current;
}
const REPO_ROOT = repositoryRootFromPackage();
const RECORDS = join(REPO_ROOT, "lib/emsenn/services/561-group/services/561-group-services-section/data/records/governing-work");

test("C-suite agent material derives solely from the admitted 561 Group governing-work read model", () => {
  const readModel = loadGoverningWorkDefinitionReadModel({ recordsRoot: RECORDS });
  assert.equal(readModel.status, "admitted");
  const target = mkdtempSync(join(tmpdir(), "codex-governing-work-projection-"));
  try {
    installHarness({ repoRoot: REPO_ROOT, target });
    for (const office of ["chief-executive-officer", "chief-operations-officer", "chief-financial-officer", "chief-technology-officer", "chief-information-officer"]) {
      const projected = readFileSync(join(target, ".codex", "agents", `${office}.toml`), "utf8");
      assert.match(projected, new RegExp(office, "u"));
      assert.match(projected, /validated governing-work read-model projection/u);
      assert.doesNotMatch(projected, /lib\/agency\/offices/u);
    }
    assert.match(readFileSync(join(target, ".codex", "agents", "chief-technology-officer.toml"), "utf8"), /cto-technology-strategy-and-roadmap/u);
  } finally { rmSync(target, { recursive: true, force: true }); }
});
