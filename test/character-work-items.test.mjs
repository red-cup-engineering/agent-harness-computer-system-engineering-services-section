import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isSettled, makeWorkItem, openWorkReminder, readWorkItems, renderHeartbeat, settleWorkItem } from "../services/claude-code-harness-services-section/src/character-work-items.mjs";

const cli = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-work-items.mjs", import.meta.url));
const store = async () => { const root = await mkdtemp("/var/tmp/character-store-"); await writeFile(path.join(root, "_index.md"), "---\nname: test-character\ndisplay-name: Test Character\n---\n"); return root; };

test("a work-item is open until a witness settles it, and HEARTBEAT is the derived reading", async () => {
  const root = await store();
  makeWorkItem(root, "write-agents-md", "Write the AGENTS.md surface file.", { raisedBy: "emsenn", on: "2026-10-10" });
  makeWorkItem(root, "verify-mcp-server", "Verify the MCP server end to end.", { raisedBy: "emsenn", dependsOn: ["write-agents-md"], on: "2026-10-10" });
  let heartbeat = await readFile(path.join(root, "HEARTBEAT.md"), "utf8");
  assert.match(heartbeat, /^# Test Character — open work-items$/mu);
  assert.match(heartbeat, /- \[ \] \*\*write-agents-md\*\* — Write the AGENTS\.md surface file\. \(`governance\/work\/items\/write-agents-md\.md`\)/u);
  assert.match(await readFile(path.join(root, "governance/work/items/verify-mcp-server.md"), "utf8"), /^depends-on:\n {2}- write-agents-md$/mu);
  assert.match(openWorkReminder(root), /2 open work-item\(s\): verify-mcp-server, write-agents-md/u);

  settleWorkItem(root, "write-agents-md", { witnessedBy: "karen-wiener", observed: "AGENTS.md exists and names every surface file", on: "2026-10-11" });
  const record = await readFile(path.join(root, "governance/work/items/write-agents-md.md"), "utf8");
  assert.ok(isSettled(record)); assert.match(record, /^## Settlement\n\n- witnessed: 2026-10-11 by karen-wiener — observed: AGENTS\.md exists and names every surface file$/mu);
  assert.doesNotMatch(record, /^status:/mu, "no status field is ever written");
  heartbeat = await readFile(path.join(root, "HEARTBEAT.md"), "utf8");
  assert.doesNotMatch(heartbeat, /write-agents-md/u); assert.match(heartbeat, /verify-mcp-server/u);
});

test("a further witness appends under the same Settlement section", async () => {
  const root = await store();
  makeWorkItem(root, "cut-release", "Cut the boot release.", { raisedBy: "emsenn" });
  settleWorkItem(root, "cut-release", { witnessedBy: "a", observed: "tag pushed", on: "2026-10-10" });
  settleWorkItem(root, "cut-release", { witnessedBy: "b", observed: "release notes read back", on: "2026-10-12" });
  const record = await readFile(path.join(root, "governance/work/items/cut-release.md"), "utf8");
  assert.equal((record.match(/^## Settlement$/gmu) ?? []).length, 1);
  assert.deepEqual(readWorkItems(root)[0].witnesses, ["- witnessed: 2026-10-10 by a — observed: tag pushed", "- witnessed: 2026-10-12 by b — observed: release notes read back"]);
  assert.match(renderHeartbeat(root).text, /No open work-items \(1 settled\)/u);
});

test("a settlement without witness or readback, an item without provenance, and a duplicate are refused", async () => {
  const root = await store();
  assert.throws(() => makeWorkItem(root, "x", "Something.", {}), /raised-by/u);
  makeWorkItem(root, "x", "Something.", { raisedBy: "emsenn" });
  assert.throws(() => makeWorkItem(root, "x", "Again.", { raisedBy: "emsenn" }), /already exists/u);
  assert.throws(() => settleWorkItem(root, "x", { observed: "done" }), /needs a witness/u);
  assert.throws(() => settleWorkItem(root, "x", { witnessedBy: "a" }), /status field by another name/u);
  assert.throws(() => settleWorkItem(root, "absent", { witnessedBy: "a", observed: "b" }), /not found/u);
  assert.equal(readWorkItems(root)[0].settled, false);
});

test("the command makes, settles, renders and reminds; the reminder is silent once nothing is open", async () => {
  const root = await store();
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.equal(run("make", root, "audit-store", "Audit the character store.", "--raised-by", "emsenn").status, 0);
  assert.match(run("open", root).stdout, /1 open work-item\(s\): audit-store/u);
  assert.equal(run("settle", root, "audit-store", "--by", "rom-keldar").status, 1);
  assert.equal(run("settle", root, "audit-store", "--by", "rom-keldar", "--observed", "audit exits 0").status, 0);
  assert.equal(run("open", root).stdout, "");
  assert.match(run("render", root).stdout, /0 open, 1 settled/u);
  assert.equal(run("render").status, 1);
});
