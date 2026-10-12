#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { writeFileText } from "@red-cup-engineering/file-services/write-file";
import { statPath } from "@red-cup-engineering/stat-path-service";
import { adoptConfigurationArgument } from "../src/configuration.mjs";

adoptConfigurationArgument(process.argv.slice(2));
const { position } = await import("../src/enterprise.mjs");

export function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--observed-at", "--output"].includes(flag) || value === undefined) {
      throw new TypeError(`unknown or incomplete argument ${flag ?? "(missing)"}`);
    }
    if (values[flag] !== undefined) throw new TypeError(`duplicate argument ${flag}`);
    values[flag] = value;
  }
  for (const flag of ["--observed-at", "--output"]) {
    if (!values[flag]) throw new TypeError(`${flag} is required`);
  }
  if (Number.isNaN(Date.parse(values["--observed-at"]))) {
    throw new TypeError("--observed-at must be an ISO timestamp");
  }
  return Object.freeze({ observedAt: values["--observed-at"], output: values["--output"] });
}

/** Writes exclusively (refuses an already-existing target) through the file-services effect owner. */
async function writeExclusiveFile(path, data, { flag } = {}) {
  if (flag === "wx" && (await statPath({ path })).exists) {
    throw Object.assign(new Error(`EEXIST: file already exists, open '${path}'`), { code: "EEXIST" });
  }
  return writeFileText(path, data);
}

export async function main(argv = process.argv.slice(2), { project = position, write = writeExclusiveFile } = {}) {
  const { observedAt, output } = parseArguments(argv);
  const enterprisePosition = { ...project(), observedAt };
  await write(output, `${JSON.stringify(enterprisePosition, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return Object.freeze({ output, position: enterprisePosition });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
