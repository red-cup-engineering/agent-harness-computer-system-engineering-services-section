import assert from "node:assert/strict";
import test from "node:test";
import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { carrierWorktreeRoot } from "../src/carrier/workspace.mjs";
import { SECTION_ROOT, sectionRootOf } from "../src/section-root.mjs";

const HOME_ENVIRONMENT = { HOME: "/home/nobody", XDG_STATE_HOME: "/home/nobody/.state", XDG_CACHE_HOME: "/home/nobody/.cache" };

test("the harness keeps its state under its own section root, whatever the home environment says", () => {
  assert.equal(sectionRootOf(HOME_ENVIRONMENT), SECTION_ROOT);
  assert.equal(carrierWorktreeRoot({ name: "claude" }, HOME_ENVIRONMENT), dataKindDirectory(SECTION_ROOT, "state", "claude-worktree"));
});

test("a section kept elsewhere is named by AGENT_HARNESS_SECTION_ROOT, not discovered from the home", () => {
  const environment = { ...HOME_ENVIRONMENT, AGENT_HARNESS_SECTION_ROOT: "/sections/harness" };
  assert.equal(carrierWorktreeRoot({ name: "codex" }, environment), dataKindDirectory("/sections/harness", "state", "codex-worktree"));
});
