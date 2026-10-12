#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { runCli } from "@emsenn/organizing";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = path.resolve(SCRIPT_DIR, "..");

try {
  const code = await runCli([
    "dispatch",
    "admit-hook-event",
    "--output-format",
    "json",
    "--root",
    process.env.DEV_BARE_CEDAR_FOG_ICK_ROOT ?? SITE_ROOT,
  ], {
    stdin: await readStdin(),
    stdout: () => {},
    stderr: process.stderr,
  });
  process.exitCode = code;
} catch (error) {
  process.stderr.write(`dev.bare-cedar-fog.emsenn.net ingest-hook: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}
