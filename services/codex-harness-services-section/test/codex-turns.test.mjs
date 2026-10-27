import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "../../../test/support/scratch.mjs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { codexConcurrency } from "../src/codex-exec.mjs";

async function observe(host, count, environment = {}) {
  const root = mkdtempSync(path.join(scratchRoot(), "codex-provider-observe-"));
  try {
    const moduleUrl = pathToFileURL(new URL("../src/codex-exec.mjs", import.meta.url).pathname).href;
    const source = `
      const { inTurn } = await import(${JSON.stringify(moduleUrl)});
      const [count, host, environment] = process.argv.slice(1);
      const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
      let running = 0, peak = 0;
      const started = [];
      await Promise.all(Array.from({ length: Number(count) }, (_, index) => inTurn(async () => {
        started.push(index); running += 1; peak = Math.max(peak, running);
        await delay(100); running -= 1;
        if (index === 1) throw new Error("a failed session frees its turn");
      }, { environment: JSON.parse(environment), host: JSON.parse(host),
        systemRunner: async () => ({ exitCode: 0, stdout: "" }) }).catch(() => undefined)));
      console.log(JSON.stringify({ peak, started }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", source,
      String(count), JSON.stringify(host), JSON.stringify(environment)], {
      cwd: process.cwd(), env: { ...process.env, HOME: path.join(root, "home"), AGENT_HARNESS_SECTION_ROOT: path.join(root, "home") }, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout.trim());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("resource-derived concurrency allows two sessions", async () => {
  const { peak, started } = await observe({ cores: 4, availableMemoryMB: 9000, usageLimit: 4 }, 4);
  assert.equal(peak, 2);
  assert.deepEqual(started, [0, 1, 2, 3]);
});

test("memory pressure scales concurrency down at the next drain", async () => {
  const { peak } = await observe({ cores: 8, availableMemoryMB: 1500, usageLimit: 4 }, 4);
  assert.equal(peak, 1);
});

test("a positive override cannot exceed the observed host ceiling", async () => {
  const { peak } = await observe({ cores: 8, availableMemoryMB: 1500, usageLimit: 4 }, 4, { METROPLAT_CODEX_CONCURRENCY: "2" });
  assert.equal(peak, 1);
});

test("unknown usage limits use the four-session ceiling", () => {
  assert.equal(codexConcurrency({}, { cores: 16, availableMemoryMB: 24000 }), 4);
});

test("active legacy Codex task units count against the shared provider ceiling", async () => {
  const { reserveCodexProviderTurn, releaseCodexProviderTurn } = await import("../src/codex-exec.mjs");
  const root = mkdtempSync(path.join(scratchRoot(), "codex-legacy-units-"));
  const home = path.join(root, "home");
  const capacity = dataKindDirectory(home, "state", "codex-provider-capacity");
  try {
    mkdirSync(capacity, { recursive: true });
    writeFileSync(path.join(capacity, "slot-0.json"), JSON.stringify({
      kind: "metroplat.codex-provider-reservation", version: 1, id: "represented", slot: 0,
      owner: { pid: process.pid, boot: "test", started: "test" }, unit: "codex-task-represented",
    }));
    const active = [
      "codex-task-represented.service loaded active running represented",
      "codex-task-agency-legacy.service loaded active running agency",
      "codex-task-agency-receive-legacy.service loaded active running receiver",
    ].join("\n");
    const lease = await reserveCodexProviderTurn({ scopeKey: "new-scope", executionIdentity: "new-work",
      environment: { HOME: home, AGENT_HARNESS_SECTION_ROOT: home, METROPLAT_CODEX_CONCURRENCY: "2" },
      host: { cores: 4, availableMemoryMB: 6000, usageLimit: 2 },
      systemRunner: async (_command, args) => args.includes("list-units")
        ? { exitCode: 0, stdout: active }
        : { exitCode: 0, stdout: "LoadState=loaded\nActiveState=active\n" } });
    assert.deepEqual({ acquired: lease.acquired, reason: lease.reason },
      { acquired: false, reason: "provider-capacity-full" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a systemd unit represented by a reservation is not counted twice", async () => {
  const { reserveCodexProviderTurn, releaseCodexProviderTurn } = await import("../src/codex-exec.mjs");
  const root = mkdtempSync(path.join(scratchRoot(), "codex-represented-unit-"));
  const home = path.join(root, "home");
  const capacity = dataKindDirectory(home, "state", "codex-provider-capacity");
  try {
    mkdirSync(capacity, { recursive: true });
    writeFileSync(path.join(capacity, "slot-0.json"), JSON.stringify({
      kind: "metroplat.codex-provider-reservation", version: 1, id: "represented", slot: 0,
      owner: { pid: process.pid, boot: "test", started: "test" }, unit: "codex-task-represented",
    }));
    const lease = await reserveCodexProviderTurn({ scopeKey: "new-scope", executionIdentity: "new-work",
      environment: { HOME: home, AGENT_HARNESS_SECTION_ROOT: home, METROPLAT_CODEX_CONCURRENCY: "2" },
      host: { cores: 4, availableMemoryMB: 6000, usageLimit: 2 },
      systemRunner: async (_command, args) => args.includes("list-units")
        ? { exitCode: 0, stdout: "codex-task-represented.service loaded active running represented\n" }
        : { exitCode: 0, stdout: "" } });
    assert.equal(lease.acquired, true);
    assert.equal(lease.slot, 1);
    await releaseCodexProviderTurn(lease);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("an inaccessible systemd user bus does not look like zero active workers", async () => {
  const { reserveCodexProviderTurn } = await import("../src/codex-exec.mjs");
  const root = mkdtempSync(path.join(scratchRoot(), "codex-unknown-units-"));
  try {
    const lease = await reserveCodexProviderTurn({ scopeKey: "new-scope", executionIdentity: "new-work",
      environment: { HOME: path.join(root, "home"), AGENT_HARNESS_SECTION_ROOT: path.join(root, "home"), METROPLAT_CODEX_CONCURRENCY: "2" },
      host: { cores: 4, availableMemoryMB: 6000, usageLimit: 2 },
      systemRunner: async () => ({ exitCode: 1, stderr: "Failed to connect to bus: No medium found" }) });
    assert.deepEqual({ acquired: lease.acquired, reason: lease.reason },
      { acquired: false, reason: "provider-activity-unknown" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("invalid override falls back to injected resources", () => {
  assert.equal(codexConcurrency({ METROPLAT_CODEX_CONCURRENCY: "0" }, { cores: 4, availableMemoryMB: 9000, usageLimit: 4 }), 2);
  assert.equal(codexConcurrency({ METROPLAT_CODEX_CONCURRENCY: "two" }, { cores: 4, availableMemoryMB: 9000, usageLimit: 4 }), 2);
});

test("an uncertain timeout stop retains the runner completion marker as unknown", async () => {
  const { waitForCodexSession } = await import("../src/codex-exec.mjs");
  const artifactDir = mkdtempSync(path.join(scratchRoot(), "codex-timeout-"));
  try {
    await waitForCodexSession({ artifactDir, unit: "codex-task-uncertain", timeoutMs: 0,
      systemRunner: async () => ({ exitCode: 1 }) });
    assert.equal(existsSync(path.join(artifactDir, "exit-code")), false);
  } finally { rmSync(artifactDir, { recursive: true, force: true }); }
});

test("a live lease owner keeps capacity after the base session exit marker", async () => {
  const root = mkdtempSync(path.join(scratchRoot(), "codex-live-owner-"));
  const home = path.join(root, "home");
  const artifactDir = path.join(root, "artifacts");
  const moduleUrl = pathToFileURL(new URL("../src/codex-exec.mjs", import.meta.url).pathname).href;
  const source = `
    const { reserveCodexProviderTurn, releaseCodexProviderTurn } = await import(${JSON.stringify(moduleUrl)});
    const [scopeKey, artifactDir] = process.argv.slice(1);
    const lease = await reserveCodexProviderTurn({ scopeKey, executionIdentity: scopeKey,
      taskId: "task-a", artifactDir, environment: { METROPLAT_CODEX_CONCURRENCY: "1" },
      host: { cores: 2, availableMemoryMB: 3000, usageLimit: 1 },
      systemRunner: async (_command, args) => args.includes("list-units")
        ? { exitCode: 0, stdout: "" } : { exitCode: 0, stdout: "" } });
    console.log(JSON.stringify({ acquired: lease.acquired, reason: lease.reason }));
    if (lease.acquired) {
      await new Promise(resolve => process.stdin.once("data", resolve));
      await releaseCodexProviderTurn(lease);
    }
  `;
  let child;
  try {
    child = spawn(process.execPath, ["--input-type=module", "-e", source, "scope-a", artifactDir], {
      cwd: process.cwd(), env: { ...process.env, HOME: home, AGENT_HARNESS_SECTION_ROOT: home }, stdio: ["pipe", "pipe", "pipe"],
    });
    const acquired = await new Promise((resolve, reject) => {
      let output = "";
      child.stdout.setEncoding("utf8").on("data", chunk => {
        output += chunk;
        const newline = output.indexOf("\n");
        if (newline >= 0) resolve(JSON.parse(output.slice(0, newline)));
      });
      child.once("error", reject);
      child.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });
    });
    assert.deepEqual(acquired, { acquired: true });
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(path.join(artifactDir, "exit-code"), "0\n");
    const { reserveCodexProviderTurn } = await import("../src/codex-exec.mjs");
    const next = await reserveCodexProviderTurn({ scopeKey: "scope-b", executionIdentity: "allocation-b",
      environment: { HOME: home, AGENT_HARNESS_SECTION_ROOT: home, METROPLAT_CODEX_CONCURRENCY: "1" }, host: { cores: 2, availableMemoryMB: 3000, usageLimit: 1 },
      systemRunner: async (_command, args) => args.includes("list-units")
        ? { exitCode: 0, stdout: "" } : { exitCode: 0, stdout: "" } });
    assert.deepEqual({ acquired: next.acquired, reason: next.reason }, { acquired: false, reason: "provider-capacity-full" });
    child.stdin.end("release\n");
    await new Promise(resolve => child.once("close", resolve));
  } finally {
    if (child?.exitCode === null) child.kill("SIGTERM");
    rmSync(root, { recursive: true, force: true });
  }
});

test("a dead owner does not free a lease while a conflict-resolution unit is active", async () => {
  const root = mkdtempSync(path.join(scratchRoot(), "codex-live-resolution-"));
  const home = path.join(root, "home");
  const artifactDir = path.join(root, "artifacts");
  const capacity = dataKindDirectory(home, "state", "codex-provider-capacity");
  const moduleUrl = pathToFileURL(new URL("../src/codex-exec.mjs", import.meta.url).pathname).href;
  try {
    mkdirSync(path.join(artifactDir, "resolution-1"), { recursive: true });
    mkdirSync(capacity, { recursive: true });
    writeFileSync(path.join(artifactDir, "exit-code"), "0\n");
    writeFileSync(path.join(capacity, "slot-0.json"), JSON.stringify({
      kind: "metroplat.codex-provider-reservation", version: 1, id: "stale-run", slot: 0,
      owner: { pid: 2147483647, boot: "old-boot", started: "0" },
      taskId: "stale", artifactDir, unit: "codex-task-stale",
    }));
    const source = `
      const { reserveCodexProviderTurn } = await import(${JSON.stringify(moduleUrl)});
      const lease = await reserveCodexProviderTurn({ scopeKey: "new-scope", executionIdentity: "new-work",
        environment: { METROPLAT_CODEX_CONCURRENCY: "1" },
        host: { cores: 2, availableMemoryMB: 3000, usageLimit: 1 },
        systemRunner: async (_command, args) => ({ exitCode: 0, stdout: args[2].includes("resolution-1")
          ? "LoadState=loaded\\nActiveState=active\\n" : "LoadState=not-found\\nActiveState=inactive\\n" }) });
      console.log(JSON.stringify({ acquired: lease.acquired, reason: lease.reason }));
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      cwd: process.cwd(), env: { ...process.env, HOME: home, AGENT_HARNESS_SECTION_ROOT: home }, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { acquired: false, reason: "provider-capacity-full" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a held resolution unit is represented by its parent lease during capacity accounting", async () => {
  const root = mkdtempSync(path.join(scratchRoot(), "codex-represented-resolution-"));
  const home = path.join(root, "home");
  const artifactDir = path.join(root, "artifacts");
  const capacity = dataKindDirectory(home, "state", "codex-provider-capacity");
  const moduleUrl = pathToFileURL(new URL("../src/codex-exec.mjs", import.meta.url).pathname).href;
  try {
    mkdirSync(path.join(artifactDir, "resolution-1"), { recursive: true });
    mkdirSync(capacity, { recursive: true });
    writeFileSync(path.join(artifactDir, "exit-code"), "0\n");
    writeFileSync(path.join(capacity, "slot-0.json"), JSON.stringify({
      kind: "metroplat.codex-provider-reservation", version: 1, id: "resolving-run", slot: 0,
      owner: { pid: 2147483647, boot: "old-boot", started: "0" },
      taskId: "resolving", artifactDir, unit: "codex-task-resolving",
    }));
    const source = `
      const { reserveCodexProviderTurn } = await import(${JSON.stringify(moduleUrl)});
      const lease = await reserveCodexProviderTurn({ scopeKey: "independent-scope", executionIdentity: "independent-work",
        environment: { METROPLAT_CODEX_CONCURRENCY: "2" },
        host: { cores: 4, availableMemoryMB: 3000, usageLimit: 2 },
        systemRunner: async (_command, args) => args.includes("list-units")
          ? { exitCode: 0, stdout: "codex-task-resolving-resolution-1.service loaded active running resolution\\n" }
          : { exitCode: 0, stdout: args[2].includes("resolution-1")
            ? "LoadState=loaded\\nActiveState=active\\n" : "LoadState=not-found\\nActiveState=inactive\\n" } });
      console.log(JSON.stringify({ acquired: lease.acquired, reason: lease.reason }));
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      cwd: process.cwd(), env: { ...process.env, HOME: home, AGENT_HARNESS_SECTION_ROOT: home }, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { acquired: true }, result.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("only one recovery process can atomically take over a dead owner's lease", async () => {
  const root = mkdtempSync(path.join(scratchRoot(), "codex-recovery-claim-"));
  const home = path.join(root, "home");
  const artifactDir = path.join(root, "artifacts");
  const capacity = dataKindDirectory(home, "state", "codex-provider-capacity");
  const moduleUrl = pathToFileURL(new URL("../src/codex-exec.mjs", import.meta.url).pathname).href;
  const source = `
    const { inTurn } = await import(${JSON.stringify(moduleUrl)});
    const reservation = { id: "recover-me", taskId: "task-recover", artifactDir: ${JSON.stringify(artifactDir)},
      unit: "codex-task-task-recover", recovering: true };
    await inTurn(async () => {
      console.log("CLAIMED");
      await new Promise(resolve => process.stdin.once("data", resolve));
    }, { environment: { METROPLAT_CODEX_CONCURRENCY: "1" },
      host: { cores: 2, availableMemoryMB: 3000, usageLimit: 1 }, reservation,
      systemRunner: async () => ({ exitCode: 0, stdout: "LoadState=loaded\\nActiveState=active\\n" }) });
  `;
  const launch = () => spawn(process.execPath, ["--input-type=module", "-e", source], {
    cwd: process.cwd(), env: { ...process.env, HOME: home, AGENT_HARNESS_SECTION_ROOT: home }, stdio: ["pipe", "pipe", "pipe"],
  });
  let first;
  let second;
  try {
    mkdirSync(artifactDir, { recursive: true });
    mkdirSync(capacity, { recursive: true });
    writeFileSync(path.join(capacity, "slot-0.json"), JSON.stringify({
      kind: "metroplat.codex-provider-reservation", version: 1, id: "recover-me", slot: 0,
      owner: { pid: 2147483647, boot: "old-boot", started: "0" },
      taskId: "task-recover", artifactDir, unit: "codex-task-task-recover",
    }));
    first = launch();
    const firstClaim = new Promise((resolve, reject) => {
      let output = "";
      first.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; if (output.includes("CLAIMED\n")) resolve(); });
      first.stderr.setEncoding("utf8").on("data", chunk => { output += chunk; });
      first.once("error", reject);
    });
    await firstClaim;
    second = launch();
    let secondOutput = "";
    second.stdout.setEncoding("utf8").on("data", chunk => { secondOutput += chunk; });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(second.exitCode, null);
    assert.equal(second.signalCode, null);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(secondOutput.includes("CLAIMED"), false);
    second.kill("SIGTERM");
    await new Promise(resolve => second.once("close", resolve));
    first.stdin.end("finished\n");
    await new Promise(resolve => first.once("close", resolve));
  } finally {
    if (first?.exitCode === null) first.kill("SIGTERM");
    if (second?.exitCode === null) second.kill("SIGTERM");
    rmSync(root, { recursive: true, force: true });
  }
});

test("recovery does not take over while a conflict-resolution child remains active", async () => {
  const root = mkdtempSync(path.join(scratchRoot(), "codex-recovery-resolution-"));
  const home = path.join(root, "home");
  const artifactDir = path.join(root, "artifacts");
  const capacity = dataKindDirectory(home, "state", "codex-provider-capacity");
  const moduleUrl = pathToFileURL(new URL("../src/codex-exec.mjs", import.meta.url).pathname).href;
  const source = `
    const { inTurn } = await import(${JSON.stringify(moduleUrl)});
    const reservation = { id: "recover-resolution", taskId: "task-resolution", artifactDir: ${JSON.stringify(artifactDir)},
      unit: "codex-task-task-resolution", recovering: true };
    await inTurn(async () => { console.log("CLAIMED"); }, {
      environment: { METROPLAT_CODEX_CONCURRENCY: "1" }, host: { cores: 2, availableMemoryMB: 3000, usageLimit: 1 }, reservation,
      systemRunner: async (_command, args) => ({ exitCode: 0, stdout: args[2].includes("resolution-1")
        ? "LoadState=loaded\\nActiveState=active\\n" : "LoadState=not-found\\nActiveState=inactive\\n" }) });
  `;
  let child;
  try {
    mkdirSync(path.join(artifactDir, "resolution-1"), { recursive: true });
    mkdirSync(capacity, { recursive: true });
    writeFileSync(path.join(artifactDir, "exit-code"), "0\n");
    writeFileSync(path.join(capacity, "slot-0.json"), JSON.stringify({
      kind: "metroplat.codex-provider-reservation", version: 1, id: "recover-resolution", slot: 0,
      owner: { pid: 2147483647, boot: "old-boot", started: "0" },
      taskId: "task-resolution", artifactDir, unit: "codex-task-task-resolution",
    }));
    child = spawn(process.execPath, ["--input-type=module", "-e", source], {
      cwd: process.cwd(), env: { ...process.env, HOME: home, AGENT_HARNESS_SECTION_ROOT: home }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { output += chunk; });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(output.includes("CLAIMED"), false);
  } finally {
    if (child?.exitCode === null) {
      const closed = new Promise(resolve => child.once("close", resolve));
      child.kill("SIGTERM");
      await closed;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test("sessions retain arrival order with one available slot", async () => {
  const { peak, started } = await observe({ cores: 2, availableMemoryMB: 3000, usageLimit: 4 }, 4);
  assert.equal(peak, 1);
  assert.deepEqual(started, [0, 1, 2, 3]);
});

test("separate processes reserve distinct scopes within one shared budget and refuse duplicate scope or overflow", async () => {
  const root = mkdtempSync(path.join(scratchRoot(), "codex-provider-scopes-"));
  const home = path.join(root, "home");
  const moduleUrl = pathToFileURL(new URL("../src/codex-exec.mjs", import.meta.url).pathname).href;
  const source = `
    const { reserveCodexProviderTurn, releaseCodexProviderTurn } = await import(${JSON.stringify(moduleUrl)});
    const [scopeKey, executionIdentity] = process.argv.slice(1);
    const lease = await reserveCodexProviderTurn({ scopeKey, executionIdentity,
      taskId: "task-" + scopeKey, artifactDir: "/tmp/codex-artifacts/" + scopeKey,
      environment: { METROPLAT_CODEX_CONCURRENCY: "2" },
      host: { cores: 4, availableMemoryMB: 9000, usageLimit: 4 },
      systemRunner: async (_command, args) => args.includes("list-units")
        ? { exitCode: 0, stdout: "" } : { exitCode: 0, stdout: "" } });
    console.log(JSON.stringify({ acquired: lease.acquired, reason: lease.reason, slot: lease.slot,
      ...(lease.record?.unit === undefined ? {} : { unit: lease.record.unit }) }));
    if (lease.acquired) {
      await new Promise(resolve => process.stdin.once("data", resolve));
      await releaseCodexProviderTurn(lease);
    }
  `;
  const launch = (scope, identity) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", source, scope, identity], {
      cwd: process.cwd(), env: { ...process.env, HOME: home, AGENT_HARNESS_SECTION_ROOT: home }, stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    const result = new Promise((resolve, reject) => {
      const poll = () => {
        const newline = stdout.indexOf("\n");
        if (newline >= 0) resolve(JSON.parse(stdout.slice(0, newline)));
        else if (child.exitCode !== null) reject(new Error(`reservation worker exited ${child.exitCode}: ${stderr}`));
        else setTimeout(poll, 10);
      };
      child.once("error", reject);
      poll();
    });
    return { child, result };
  };
  const workers = [];
  try {
    const first = launch("scope-a", "allocation-a"); workers.push(first);
    assert.deepEqual(await first.result, { acquired: true, slot: 0, unit: "codex-task-task-scope-a" });
    const duplicate = launch("scope-a", "allocation-a-retry"); workers.push(duplicate);
    assert.deepEqual(await duplicate.result, { acquired: false, reason: "scope-active" });
    const second = launch("scope-b", "allocation-b"); workers.push(second);
    assert.deepEqual(await second.result, { acquired: true, slot: 1, unit: "codex-task-task-scope-b" });
    const overflow = launch("scope-c", "allocation-c"); workers.push(overflow);
    assert.deepEqual(await overflow.result, { acquired: false, reason: "provider-capacity-full" });
    first.child.stdin.end("release\n");
    second.child.stdin.end("release\n");
    await Promise.all([first.child, duplicate.child, second.child, overflow.child].map(child => child.exitCode !== null || child.signalCode !== null
      ? Promise.resolve()
      : new Promise(resolve => child.once("close", resolve))));
  } finally {
    for (const { child } of workers) if (child.exitCode === null) child.kill("SIGTERM");
    rmSync(root, { recursive: true, force: true });
  }
});
