#!/usr/bin/env node
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { adoptConfigurationArgument } from "../src/configuration.mjs";

adoptConfigurationArgument(process.argv.slice(2));
const { compileCodexMapeCycle } = await import("../src/mape-office.mjs");

try {
  const { text } = await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: process.stdin });
  const input = JSON.parse(text);
  process.stdout.write(`${JSON.stringify(compileCodexMapeCycle(input), null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ type: "CodexMapeCycleRefusal", disposition: "refused", reason: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
  process.exitCode = 2;
}
