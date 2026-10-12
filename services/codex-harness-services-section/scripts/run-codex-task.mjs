#!/usr/bin/env node
// Compatibility entry point for running one encoded task spec. runCodexTask records its journal
// states and starts the Codex subprocess in its own transient unit. Argument: JSON in base64url.
import { runCodexTask } from "../src/operations.mjs";

const spec = JSON.parse(Buffer.from(process.argv[2] ?? "", "base64url").toString("utf8"));
await runCodexTask(spec);
