#!/usr/bin/env node
// character-surface-files render STORE [soul|identity|memory ...]   (default: every surface the store has a source for)
import { existsSync } from "node:fs";
import { join } from "node:path";
import { renderIdentity, renderMemory, renderSoul } from "../src/character-surface-files.mjs";

const [command, store, ...which] = process.argv.slice(2);
try {
  if (command !== "render" || !store) throw new Error("usage: character-surface-files render STORE [soul|identity|memory ...]");
  const sources = { soul: join(store, "code", "structures", "soul.md"), identity: join(store, "identity.md"), memory: store };
  const renderers = { soul: renderSoul, identity: renderIdentity, memory: renderMemory };
  const chosen = which.length ? which : Object.keys(renderers).filter((surface) => existsSync(sources[surface]));
  for (const surface of chosen) { if (!renderers[surface]) throw new Error(`unknown surface: ${surface}`); console.log(`rendered ${renderers[surface](store)}`); }
} catch (error) { console.error(error.message); process.exit(1); }
