#!/usr/bin/env node
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { adoptConfigurationArgument } from "../src/configuration.mjs";

adoptConfigurationArgument(process.argv.slice(2));
const { executeA2aMessage } = await import("../src/a2a-executor.mjs");
try {
  const { text } = await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: process.stdin });
  process.stdout.write(`${JSON.stringify(await executeA2aMessage(JSON.parse(text)))}\n`);
}
catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; }
