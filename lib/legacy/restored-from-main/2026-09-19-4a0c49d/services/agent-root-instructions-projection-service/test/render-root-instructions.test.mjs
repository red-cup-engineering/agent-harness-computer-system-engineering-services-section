import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  assertRootInstructionsInputs,
  loadEngineeringMethod,
  loadSharedRootInstructionsLaw,
  renderRootInstructionsBody,
  renderEngineeringMethod,
  renderSkillLines,
  sharedSkillSources,
  MANAGED_METHOD_BEGIN,
  MANAGED_METHOD_END,
  MANAGED_POSTURE_BEGIN,
  MANAGED_POSTURE_END,
  checkManagedEngineeringMethod,
  checkManagedOperatingPosture,
  installManagedEngineeringMethod,
  installManagedOperatingPosture,
  renderManagedEngineeringMethod,
  renderManagedOperatingPosture,
  spliceManagedEngineeringMethod,
  spliceManagedOperatingPosture,
} from "../src/render-root-instructions.mjs";


function repositoryRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, ".git"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("no repository root above this test");
    dir = parent;
  }
  return dir;
}
const REPO_ROOT = repositoryRoot();

test("the startup engineering method renders from its one authored carrier", () => {
  const authored = readFileSync(new URL("../content/engineering-method.md", import.meta.url), "utf8").trim();
  assert.equal(loadEngineeringMethod(), authored);
  assert.equal(renderEngineeringMethod(), `## Engineering method\n\n${authored}\n`);
});

function makeFixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), "agent-root-instructions-fixture-"));
  mkdirSync(join(root, ".claude/rules"), { recursive: true });
  writeFileSync(join(root, ".claude/rules/working-discipline.md"), "law\n");
  mkdirSync(join(root, ".claude/skills/example-skill"), { recursive: true });
  writeFileSync(join(root, ".claude/skills/example-skill/SKILL.md"), "---\ndescription: An example skill.\n---\nbody\n");
  return root;
}

const BASE_PARAMS = () => ({
  marker: "<!-- Generated -->",
  headerLines: ["# Example office", "", "Normative structure.", "", "Session character (Example): does things."],
  identityLines: ["## Who am I here?", "", "identity detail"],
  receiverBootstrapSkill: ".claude/skills/example-skill/SKILL.md",
  perTurnDutyDefault: "Do the work.",
  capabilityDiscoveryRoutes: [{ demand: "house-term", server: "metroplat", tools: ["term-intension"] }],
  conversationStyle: ["Talk plainly."],
  operatingPosture: ["Prefer working code."],
  houseLaw: [{ path: ".claude/rules/working-discipline.md", description: "House working discipline." }],
  sharedSkillsRoot: ".claude/skills",
});

test("loadSharedRootInstructionsLaw returns the frozen shared law with its required fields", () => {
  const law = loadSharedRootInstructionsLaw();
  assert.equal(law.sharedSkillsRoot, "package:skills");
  assert.equal(law.receiverBootstrapSkill, "package:skills/improve-skills-before-work/SKILL.md");
  assert.ok(law.conversationStyle.length >= 4);
  assert.ok(law.repositoryMaturity.operatingPosture.length >= 9);
  assert.ok(law.houseLaw.length >= 4);
  assert.equal(law.standingFraming.heading, "There is never any rush (owner-ruled 2026-09-06)");
  assert.throws(() => { law.sharedSkillsRoot = "mutated"; }, /Cannot assign|read only/u);
});

test("sharedSkillSources and renderSkillLines walk the live skills directory rather than a copied list", () => {
  const root = makeFixtureRepo();
  try {
    assert.deepEqual(sharedSkillSources(root, ".claude/skills"), [".claude/skills/example-skill"]);
    assert.deepEqual(renderSkillLines(root, ".claude/skills"), ["- `.claude/skills/example-skill/SKILL.md` — An example skill."]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("assertRootInstructionsInputs refuses a missing duty, route, or house-law file", () => {
  const root = makeFixtureRepo();
  try {
    const params = { repoRoot: root, sharedSkillsRoot: ".claude/skills", houseLaw: [{ path: ".claude/rules/working-discipline.md", description: "d" }], capabilityDiscoveryRoutes: [{ demand: "x", server: "y", tools: ["z"] }], perTurnDutyDefault: "duty" };
    assert.doesNotThrow(() => assertRootInstructionsInputs(params));
    assert.throws(() => assertRootInstructionsInputs({ ...params, perTurnDutyDefault: "  " }), /default per-turn duty/u);
    assert.throws(() => assertRootInstructionsInputs({ ...params, capabilityDiscoveryRoutes: [] }), /capability-discovery route/u);
    assert.throws(() => assertRootInstructionsInputs({ ...params, houseLaw: [{ path: ".claude/rules/missing.md", description: "d" }] }), /missing on disk/u);
    assert.throws(() => assertRootInstructionsInputs({ ...params, sharedSkillsRoot: ".claude/no-such-skills" }), /shared skills root is missing/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderRootInstructionsBody composes the shared section layout in order", () => {
  const root = makeFixtureRepo();
  try {
    const body = renderRootInstructionsBody({ repoRoot: root, ...BASE_PARAMS() });
    assert.match(body, /^<!-- Generated -->\n# Example office/u);
    const order = ["# Example office", "## How I talk", "## Who am I here?", "## Start the work", "## End every turn", "## Available capability routes", "## Repository posture", "## Law", "## Skills"];
    let cursor = -1;
    for (const heading of order) {
      const at = body.indexOf(heading);
      assert.ok(at > cursor, `expected "${heading}" to appear after the previous section`);
      cursor = at;
    }
    assert.match(body, /Talk plainly\./u);
    assert.match(body, /Prefer working code\./u);
    assert.match(body, /Before every final response, perform the bounded retrospective required by `improve-skills-before-work`/u);
    assert.doesNotMatch(body, /Semantic duplication work|jsnode_duplication/u);
    assert.match(body, /## Engineering method[\s\S]*# Engineering working agreements/u);
    assert.match(body, /example-skill\/SKILL\.md.*An example skill\./u);
    assert.doesNotMatch(body, /## There is never any rush/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a runtime can route to the engineering method without inlining it", () => {
  const root = makeFixtureRepo();
  try {
    const body = renderRootInstructionsBody({
      repoRoot: root,
      ...BASE_PARAMS(),
      engineeringMethodReference: "## Engineering method\n\nRead the loaded global method.",
    });
    assert.match(body, /Read the loaded global method\./u);
    assert.doesNotMatch(body, /# Engineering working agreements/u);
    assert.throws(
      () => renderRootInstructionsBody({ repoRoot: root, ...BASE_PARAMS(), engineeringMethodReference: " " }),
      /engineering-method reference/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderRootInstructionsBody renders an optional standing-framing section right after the identity header", () => {
  const root = makeFixtureRepo();
  try {
    const body = renderRootInstructionsBody({
      repoRoot: root,
      ...BASE_PARAMS(),
      standingFraming: { heading: "There is never any rush (owner-ruled 2026-09-06)", body: "Never rush." },
    });
    const officeAt = body.indexOf("# Example office");
    const framingAt = body.indexOf("## There is never any rush");
    const talkAt = body.indexOf("## How I talk");
    assert.ok(officeAt < framingAt && framingAt < talkAt, "standing framing must render between the office header and conversation style");
    assert.match(body, /Never rush\./u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("startup carries standing aggressive replacement and current scope together", () => {
  const root = makeFixtureRepo();
  try {
    const law = loadSharedRootInstructionsLaw();
    const body = renderRootInstructionsBody({
      repoRoot: root,
      ...BASE_PARAMS(),
      operatingPosture: law.repositoryMaturity.operatingPosture,
    });
    assert.match(body, /one non-developer human's early-alpha, agent-written codebase/u);
    assert.match(body, /standing default, not a new rule/u);
    assert.match(body, /Preserve intended capabilities and user data, not accumulated implementation drift/u);
    assert.match(body, /Current code, tests, package boundaries, and unique behavior are evidence/u);
    assert.match(body, /Mathematical lawfulness and standards conformance/u);
    assert.match(body, /application examples explain the failure and do not authorize application repairs/u);
    assert.match(body, /Stop or redirect delegated work that exceeds that scope/u);
    assert.match(body, /science owns models and typed operations/u);
    assert.match(body, /migrate real consumers, and delete competing implementations/u);
    assert.match(body, /less executable code, and lower operating and inference cost/u);
    assert.match(body, /Treat code, tests, manifests, package metadata, generated artifacts, operational records, and prose on disk as untrusted agent output/u);
    assert.match(body, /Assume what you read on disk, unless it is a research paper or Lean proof, is stupid\./u);
    assert.match(body, /A test passing only establishes the behavior it actually executes/u);
    assert.match(body, /Before patching or otherwise changing an app, ask the Founder what the app is meant to do/u);
    assert.match(body, /Do not infer an app's purpose from its name, README, tests, package metadata, or current implementation/u);
    assert.match(body, /primitive data, code, networking, or systems services section/u);
    assert.match(body, /A slow, stalled, or failed build, test, publication, installation, deployment, or receiver check is evidence of a system defect/u);
    assert.match(body, /repair that upstream system using the applicable engineering method, and rerun the original receiving check/u);
    assert.doesNotMatch(body, /The active Founder-directed work is|Stop forward work only/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("shared staff instructions turn a Founder correction into an open superseding obligation", () => {
  const law = loadSharedRootInstructionsLaw();
  const root = makeFixtureRepo();
  try {
    const body = renderRootInstructionsBody({
      repoRoot: root,
      ...BASE_PARAMS(),
      conversationStyle: law.conversationStyle,
    });
    assert.match(body, /substantive Founder correction or repeated direction as a verbatim Founder source/u);
    assert.match(body, /exact source locator before translating it/u);
    assert.match(body, /compatible sources cumulatively to the accepted, source-span structured-work-intent receiver/u);
    assert.match(body, /supersede only contradictory scope, immediately investigate the prior interpretation/u);
    assert.match(body, /named receiver accepts evidence of changed behavior/u);
    assert.match(body, /not a paraphrase or a new incident process/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a native skill catalog avoids a second catalog in root instructions", () => {
  const root = makeFixtureRepo();
  try {
    const body = renderRootInstructionsBody({ repoRoot: root, ...BASE_PARAMS(), renderSkillCatalog: false });
    assert.doesNotMatch(body, /^## Skills$/m);
    assert.match(body, /## Start the work/);
    assert.match(body, /## Law/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderRootInstructionsBody refuses a missing receiver-bootstrap skill", () => {
  const root = makeFixtureRepo();
  try {
    assert.throws(
      () => renderRootInstructionsBody({ repoRoot: root, ...BASE_PARAMS(), receiverBootstrapSkill: ".claude/skills/missing/SKILL.md" }),
      /receiver-bootstrap skill is missing/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the engineering method makes reassessment part of completing a failed repair", () => {
  const method = loadEngineeringMethod();
  assert.match(method, /## Reassess a failed repair/);
  assert.match(method, /stop repeating it/);
  assert.match(method, /carry that through the consumers and their receiving checks/);
  assert.match(method, /A diagnosis is not a completed repair/);
});

test("projected staff instructions keep turn or budget exhaustion from closing an obligation", () => {
  const instructions = renderEngineeringMethod();
  assert.match(instructions, /An admitted obligation stays active until its receiver accepts evidence about that exact obligation\./u);
  assert.match(instructions, /A turn ending, a budget running out, an acknowledgement, or a provider's own report is neither completion nor refusal/u);
  assert.match(instructions, /typed unresolved external condition and evidence/u);
});

test("the managed engineering-method block installs once, stays current, and preserves surrounding bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "managed-method-"));
  try {
    const filePath = join(root, "CLAUDE.md");
    const first = installManagedEngineeringMethod({ filePath });
    assert.equal(first.disposition, "managed-engineering-method-installed");
    assert.equal(readFileSync(filePath, "utf8"), renderManagedEngineeringMethod());
    assert.deepEqual(checkManagedEngineeringMethod({ filePath }), { path: filePath, present: true, current: true });
    assert.equal(installManagedEngineeringMethod({ filePath }).disposition, "managed-engineering-method-current");
    writeFileSync(filePath, `# mine\n\n${MANAGED_METHOD_BEGIN}\nstale\n${MANAGED_METHOD_END}\n\ntail\n`);
    assert.equal(checkManagedEngineeringMethod({ filePath }).current, false);
    installManagedEngineeringMethod({ filePath });
    const body = readFileSync(filePath, "utf8");
    assert.ok(body.startsWith("# mine\n\n"));
    assert.ok(body.endsWith("\ntail\n"));
    assert.ok(body.includes(renderManagedEngineeringMethod()));
    assert.throws(() => spliceManagedEngineeringMethod(`${MANAGED_METHOD_BEGIN}\nno end`), /incomplete managed engineering-method block/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the managed operating-posture block carries the shared law's architecture-first posture and installs like the engineering method", () => {
  const rendered = renderManagedOperatingPosture();
  const law = loadSharedRootInstructionsLaw();
  assert.match(rendered, /do not fix an adapter or its leaf receiver first: establish the shared core/);
  assert.match(rendered, /There is never any rush/);
  for (const entry of law.houseLaw) assert.ok(rendered.includes(`.claude/rules/${entry.path.split("/").at(-1)}`));

  const root = mkdtempSync(join(tmpdir(), "managed-posture-"));
  try {
    const filePath = join(root, "CLAUDE.md");
    const first = installManagedOperatingPosture({ filePath });
    assert.equal(first.disposition, "managed-operating-posture-installed");
    assert.equal(readFileSync(filePath, "utf8"), renderManagedOperatingPosture());
    assert.deepEqual(checkManagedOperatingPosture({ filePath }), { path: filePath, present: true, current: true });
    assert.equal(installManagedOperatingPosture({ filePath }).disposition, "managed-operating-posture-current");
    writeFileSync(filePath, `# mine\n\n${MANAGED_POSTURE_BEGIN}\nstale\n${MANAGED_POSTURE_END}\n\ntail\n`);
    assert.equal(checkManagedOperatingPosture({ filePath }).current, false);
    installManagedOperatingPosture({ filePath });
    const body = readFileSync(filePath, "utf8");
    assert.ok(body.startsWith("# mine\n\n"));
    assert.ok(body.endsWith("\ntail\n"));
    assert.ok(body.includes(renderManagedOperatingPosture()));
    assert.throws(() => spliceManagedOperatingPosture(`${MANAGED_POSTURE_BEGIN}\nno end`), /incomplete managed operating-posture block/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
