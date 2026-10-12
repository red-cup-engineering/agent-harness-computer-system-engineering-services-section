#!/usr/bin/env node
// character-store-audit [STORE] [--items DIR]   exit 0 clean, 1 violations
import { auditCharacterStore } from "../src/character-store-audit.mjs";

const args = process.argv.slice(2); const at = args.indexOf("--items"); const items = at >= 0 ? args.splice(at, 2)[1] : undefined;
const { violations, warnings, results } = auditCharacterStore(args[0] ?? ".", items ? { items } : {});
let section = null;
for (const result of results) { if (result.section !== section) { section = result.section; console.log(`\n=== ${section} ===`); } console.log(`  ${result.level}  ${result.message}`); }
console.log(`\n${violations} violation(s), ${warnings} warning(s).`);
process.exit(violations > 0 ? 1 : 0);
