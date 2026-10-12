#!/usr/bin/env node
// Generic office seating: every colleague office this policy has ever gained
// a character+incumbency pair for was hand-authored, once per office, from
// the same shape (see content/characters/claude-<office>-session.json and
// content/incumbencies/claude-<office>-session-as-<office>.json under
// bare-cedar-fog-claude-services-section). That is the leaf-fixing pattern
// the founder named on 2026-09-06 — one office seated by hand is not the
// fix; this script derives the pair from the office's own record so seating
// a new office never again means hand-typing a 13th near-identical JSON pair.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

function firstSentence(text) {
  return String(text ?? "").split(/(?<=\.)\s/)[0];
}

/**
 * Derives a default session character and settled incumbency for one office
 * that has no seating yet, from the office's own canonical record, and
 * writes both beside the machine's existing seatings.
 * @param {object} request
 * @param {string} request.officeRecordPath absolute path to the office's canonical JSON record
 * @param {string} request.charactersDir absolute path to the machine's content/characters/ directory
 * @param {string} request.incumbenciesDir absolute path to the machine's content/incumbencies/ directory
 * @param {string} request.recordedBy the seating session's own identity, for x-provenance
 * @param {string} request.date ISO date the seating is recorded on
 * @returns {{officeId: string, characterPath: string, incumbencyPath: string, characterRelative: string, incumbencyRelative: string}}
 */
export function seatOfficeWithDefaultCharacter({ officeRecordPath, charactersDir, incumbenciesDir, recordedBy, date }) {
  const spec = JSON.parse(readFileSync(officeRecordPath, "utf8"));
  if (spec.kind !== "office") throw new Error(`${officeRecordPath} declares 'kind: ${spec.kind ?? "(nothing)"}' — refusing to seat a non-office`);
  const officeId = spec.id ?? basename(officeRecordPath, ".json");
  const characterId = `claude-${officeId}-session`;
  const incumbencyId = `${characterId}-as-${officeId}`;
  const characterPath = join(charactersDir, `${characterId}.json`);
  const incumbencyPath = join(incumbenciesDir, `${incumbencyId}.json`);
  if (existsSync(characterPath) || existsSync(incumbencyPath)) {
    throw new Error(`office '${officeId}' already has a seating at ${characterPath} / ${incumbencyPath} — not overwriting`);
  }
  const character = {
    id: characterId,
    name: `Claude ${officeId} session`,
    kind: "session",
    disposition: firstSentence(spec["normative-structure"]) || `Holds the office of ${spec.name ?? officeId}.`,
    voice: "Plain, cites the office record and its own instruments rather than paraphrasing from recall.",
    "x-provenance": {
      "recorded-by": recordedBy,
      "recorded-on": date,
      customer: "urn:leader:emsenn",
      basis: `Seats the durable session role that animates the ${officeId} office (${relative(process.cwd(), officeRecordPath)}), derived mechanically from the office's own record rather than hand-authored, per the founder's 2026-09-06 ruling against hand-seating one office at a time.`,
    },
  };
  const incumbency = {
    id: incumbencyId,
    office: officeId,
    holder: characterId,
    recognition: "t",
    induction: "t",
    from: date,
    "x-provenance": {
      "recorded-by": recordedBy,
      "recorded-on": date,
      customer: "urn:leader:emsenn",
      "office-source": relative(process.cwd(), officeRecordPath),
      "holder-source": relative(process.cwd(), characterPath),
      basis: `Recognition t and induction t both commit forward from ${date}, derived mechanically alongside its character rather than hand-authored.`,
    },
  };
  mkdirSync(charactersDir, { recursive: true });
  mkdirSync(incumbenciesDir, { recursive: true });
  writeFileSync(characterPath, `${JSON.stringify(character, null, 2)}\n`);
  writeFileSync(incumbencyPath, `${JSON.stringify(incumbency, null, 2)}\n`);
  return { officeId, characterPath, incumbencyPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [officeRecordPath, charactersDir, incumbenciesDir, recordedBy] = process.argv.slice(2);
  if (!officeRecordPath || !charactersDir || !incumbenciesDir || !recordedBy) {
    process.stderr.write("usage: seat-office-with-default-character.mjs <officeRecordPath> <charactersDir> <incumbenciesDir> <recordedBy>\n");
    process.exit(2);
  }
  try {
    const result = seatOfficeWithDefaultCharacter({
      officeRecordPath: resolve(officeRecordPath),
      charactersDir: resolve(charactersDir),
      incumbenciesDir: resolve(incumbenciesDir),
      recordedBy,
      date: new Date().toISOString().slice(0, 10),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`seat-office-with-default-character: ${error.message}\n`);
    process.exit(1);
  }
}
