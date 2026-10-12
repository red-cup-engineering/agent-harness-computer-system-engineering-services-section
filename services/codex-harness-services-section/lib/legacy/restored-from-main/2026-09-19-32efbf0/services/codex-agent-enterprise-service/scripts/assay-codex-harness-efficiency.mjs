#!/usr/bin/env node
// Run the harness-neutral hook cost assay against the Codex lifecycle handler
// this machine has actually wired, and report whether the harness stays
// cheaper and faster than raw carrier injection.
//
// The handler under test is not imported by package name: it is the handler
// this machine's own hook manifest names, resolved against the configured
// territory, so the assay measures what is wired rather than what a dependency
// happens to export.
//
//   assay-codex-harness-efficiency [--configuration <record>]
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { makeDirectory } from "@red-cup-engineering/make-directory-service";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { runHarnessEfficiencyAssay } from "@red-cup-engineering/harness-lifecycle-journal-service/harness-efficiency";
import { adoptConfigurationArgument, codexEnterpriseConfiguration } from "../src/configuration.mjs";

adoptConfigurationArgument(process.argv.slice(2));
const { ACTOR, readTrajectory } = await import("../src/enterprise.mjs");
const { OBJECT_KIND_NAMESPACE, semanticIdentity } = await import("../src/semiotic-circuit.mjs");
const { contextAddressForHookEvent } = await import("../src/context-address.mjs");

const configuration = codexEnterpriseConfiguration();

/** The lifecycle handler this machine's hook manifest wires for the enterprise. */
async function wiredHandler() {
  if (typeof configuration.hooksManifest !== "string" || configuration.hooksManifest.trim() === "") {
    throw new TypeError("the enterprise configuration must name its hooksManifest for this assay to find the wired handler");
  }
  const manifest = JSON.parse(await readFileText(resolveFilepath([configuration.agentsRoot, configuration.hooksManifest])));
  const declared = manifest.handlers?.enterprise;
  if (typeof declared !== "string" || declared.trim() === "") throw new TypeError("the hook manifest must name its enterprise handler");
  const module = await import(pathToFileURL(resolveFilepath([configuration.territory, declared])).href);
  if (typeof module.handlerWith !== "function") throw new TypeError(`${declared} does not export handlerWith(options)`);
  return module;
}

// A bounded pointer names this actor's own proof-path root and resolves through
// one of its own context resolvers; both come from the loaded configuration.
const ADDRESS_ROOT = contextAddressForHookEvent("SessionStart").address.split("/continuity/")[0];
const POINTER = new RegExp(`^ADDRESS ${ADDRESS_ROOT}/[a-z-]+/[a-z-]+\\. TYPE [A-Za-z]+\\. RESOLVE [a-z_]+\\.(?: READ [a-z0-9_, ]+\\.)?(?: CORRECTION active; restart Monitor before actuation\\.)?$`, "u");

const wired = await wiredHandler();
// runHarnessEfficiencyAssay is pure given its inputs: it never creates its own
// working directory (that is a filesystem effect), so this script makes one
// through the make-directory-service effect owner and hands it in.
const stateRoot = `${tmpdir()}/harness-efficiency-${randomUUID()}`;
await makeDirectory({ path: stateRoot });
const result = runHarnessEfficiencyAssay({
  runtime: "codex",
  handler: (event, options) => wired.handlerWith(options)(event),
  actor: ACTOR,
  monitorStateDigest: semanticIdentity({ state: "unchanged" }, `${OBJECT_KIND_NAMESPACE}.harness-monitor-state`).id,
  additionalContextLimit: wired.HOOK_ADDITIONAL_CONTEXT_LIMIT,
  pointer: (text) => POINTER.test(text),
  readTrajectory,
  stateRoot,
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.passed) process.exitCode = 1;
