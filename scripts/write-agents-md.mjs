#!/usr/bin/env node
// Write AGENTS.md from records (rule agents-md-is-generated-from-records): the same bytes to every target.
//
//   write-agents-md --projection <record> --root <directory its paths resolve from> --write <AGENTS.md path>...
import { writeFileSync } from "node:fs";

import { readProjection, renderAgentsMd } from "../src/agents-md.mjs";

/** `--projection` and `--root` once each, `--write` one or more times; anything else is refused. */
function parseArguments(argv) {
  const options = { projection: undefined, root: undefined, write: [] };
  for (let index = 0; index < argv.length; index += 2) {
    const [flag, value] = [argv[index], argv[index + 1]];
    if (value === undefined || !["--projection", "--root", "--write"].includes(flag)) throw new TypeError(`write-agents-md: expected --projection, --root or --write with a value at ${flag}`);
    if (flag === "--write") options.write.push(value);
    else options[flag.slice(2)] = value;
  }
  const missing = ["projection", "root"].filter((name) => options[name] === undefined).concat(options.write.length === 0 ? ["write"] : []);
  if (missing.length > 0) throw new TypeError(`write-agents-md: name ${missing.map((name) => `--${name}`).join(", ")}`);
  return Object.freeze(options);
}

const options = parseArguments(process.argv.slice(2));
const text = renderAgentsMd(readProjection({ record: options.projection, root: options.root }));
for (const target of options.write) writeFileSync(target, text);
