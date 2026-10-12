import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG_ENV_VAR, KNOWN_VIOLATIONS_ENV_VAR, checkArchitectureGate, checkedCarrier, cruiseCarrier, violationText } from "../scripts/check-architecture-gate-hook.mjs";
import { commandReceipt, lifecycleEvent, responseOf } from "./lifecycle-event.mjs";

const present = async ({ path }) => ({ type: "PathStat", path, exists: true, kind: "file", size: 1, mtimeMs: 0 });
const absent = async ({ path }) => ({ type: "PathStat", path, exists: false, kind: "absent", size: null, mtimeMs: null });

test("only JavaScript and TypeScript carriers inside the service tree are cruised", () => {
  for (const path of ["lib/a.mjs", "lib/a.cjs", "lib/a.js", "lib/a.mts", "lib/a.ts", "/repo/lib/deep/a.mjs"]) {
    assert.equal(checkedCarrier(path, "/repo"), path.startsWith("/repo/") ? path.slice("/repo/".length) : path, path);
  }
  for (const path of ["lib/a.md", "lib/a.json", "dev/a.mjs", "/elsewhere/lib/a.mjs", "../outside/lib/a.mjs", "", undefined]) {
    assert.equal(checkedCarrier(path, "/repo"), undefined, String(path));
  }
});

test("the cruiser's installation advice is filtered out of a refusal", () => {
  const text = [
    "  error some-rule: lib/a.mjs -> fs",
    "  WARN: depcruise is globally installed",
    "  we recommend to install it in your project instead",
    "  no transpilers at all",
    "  TypeScript, Vue or Svelte modules",
    "",
    "x 1 dependency violations",
  ].join("\n");
  assert.equal(violationText(text), "  error some-rule: lib/a.mjs -> fs\nx 1 dependency violations");
});

test("the cruise is one exact program request naming the ruleset, the known violations, and the carrier", () => {
  const requests = [];
  const clean = cruiseCarrier({
    filePath: "lib/a.mjs",
    root: "/repo",
    execute: (request) => {
      requests.push(request);
      return commandReceipt({});
    },
  });
  assert.deepEqual(clean, { clean: true });
  const request = requests[0];
  assert.equal(request.command, "depcruise");
  assert.equal(request.directory, "/repo");
  assert.equal(request.environment, null);
  assert.equal(request.arguments[0], "--config");
  assert.match(request.arguments[1], /jsnode-workspace-analysis-services-section\/\.dependency-cruiser\.cjs$/);
  assert.equal(request.arguments[2], "--ignore-known");
  assert.match(request.arguments[3], /\.dependency-cruiser-known-violations\.json$/);
  assert.deepEqual(request.arguments.slice(4), ["--output-type", "err", "--max-depth", "1", "/repo/lib/a.mjs"]);
});

test("a violating cruise reports the cruiser's own finding, and a cruiser that cannot run says so", () => {
  const violating = cruiseCarrier({ filePath: "lib/a.mjs", root: "/repo", execute: () => commandReceipt({ status: 1, stdout: "  error raw-substrate-only-in-effect-owners: lib/a.mjs -> fs" }) });
  assert.equal(violating.clean, false);
  assert.match(violating.reason, /raw-substrate-only-in-effect-owners/);
  assert.deepEqual(cruiseCarrier({ filePath: "lib/a.mjs", root: "/repo", execute: () => commandReceipt({ status: null }) }), { clean: false, reason: "the architecture gate could not run" });
});

test("the ruleset and the known-violations record are parameters", () => {
  const requests = [];
  cruiseCarrier({
    filePath: "lib/a.mjs",
    root: "/repo",
    config: "tools/.cruiser.cjs",
    knownViolations: "tools/known.json",
    execute: (request) => {
      requests.push(request);
      return commandReceipt({});
    },
  });
  assert.equal(requests[0].arguments[1], "/repo/tools/.cruiser.cjs");
  assert.equal(requests[0].arguments[3], "/repo/tools/known.json");
});

test("the PostToolUse reaction cruises a written carrier and continues past everything else", async () => {
  const gate = (event, options = {}) => checkArchitectureGate(event, { root: "/repo", stat: present, environment: {}, execute: () => commandReceipt({}), ...options });
  const written = (filePath, tool = "Write") => lifecycleEvent({ event: "PostToolUse", tool, toolInput: { file_path: filePath } });
  assert.equal(responseOf(await gate(written("lib/services/thing/src/thing.mjs"))).disposition, "continue");
  assert.equal(responseOf(await gate(written("lib/services/thing/README.md"))).disposition, "continue");
  assert.equal(responseOf(await gate(lifecycleEvent({ event: "PostToolUse", tool: "Bash", toolInput: { command: "ls" } }))).disposition, "continue");
  assert.equal(responseOf(await gate(written("lib/a.mjs"), { stat: absent })).disposition, "continue");
  assert.equal(responseOf(await gate(lifecycleEvent({ event: "PostToolUse" }))).disposition, "continue");
});

test("a violation on a written carrier blocks with the cruiser's finding", async () => {
  const response = responseOf(await checkArchitectureGate(
    lifecycleEvent({ event: "PostToolUse", tool: "Edit", toolInput: { file_path: "lib/a.mjs" } }),
    { root: "/repo", stat: present, environment: {}, execute: () => commandReceipt({ status: 1, stderr: "  error not-to-unresolvable: lib/a.mjs -> nowhere" }) },
  ));
  assert.equal(response.disposition, "block");
  assert.match(response.reason, /not-to-unresolvable/);
});

test("the ruleset and the known-violations record can be redirected from the environment", async () => {
  const requests = [];
  await checkArchitectureGate(lifecycleEvent({ event: "PostToolUse", tool: "Write", toolInput: { file_path: "lib/a.mjs" } }), {
    root: "/repo",
    stat: present,
    environment: { [CONFIG_ENV_VAR]: "tools/.cruiser.cjs", [KNOWN_VIOLATIONS_ENV_VAR]: "tools/known.json" },
    execute: (request) => {
      requests.push(request);
      return commandReceipt({});
    },
  });
  assert.equal(requests[0].arguments[1], "/repo/tools/.cruiser.cjs");
  assert.equal(requests[0].arguments[3], "/repo/tools/known.json");
});
