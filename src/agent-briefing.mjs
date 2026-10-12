/**
 * @module agent-briefing
 * A briefing any assistant can be given (ChatGPT, Claude, a local model) so it knows whom it
 * serves on a MetroPlat instance, what that instance is, what its principal's offices are
 * obliged to do and by which notes, which powers the principal holds, and how to connect.
 * Projected from the instance's agency records and section READMEs, never written by hand:
 * correct the records and project again.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { officeReading } from "@red-cup-engineering/organizing/agency";
import { agencyAt } from "@red-cup-engineering/organizing/agency/held";

const raw = (agency, record) => {
  if (!record?.source) return {};
  const file = path.join(agency.root, record.source);
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".json")) return JSON.parse(text);
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u.exec(text);
  return { body: (match ? match[2] : text).trim() };
};

/** The first paragraph of a section's README: what the section says it is. */
function readmeLead(dir) {
  const file = path.join(dir, "README.md");
  if (!existsSync(file)) return undefined;
  const body = readFileSync(file, "utf8").replace(/^#[^\n]*\n+/u, "");
  return body.split(/\n\s*\n/u).find((block) => block.trim() && !block.startsWith("#") && !block.startsWith("-"))?.replace(/\s+/gu, " ").trim();
}

/**
 * @param {{ agencyRoot: string, holder: string, principal: string, instance: { name: string, title: string, origin: string } }} input
 *   `holder` is the principal's account on the instance (as its incumbencies name it);
 *   `principal` is the person's name; `origin` is the instance's public origin.
 * @returns {{ markdown: string, offices: string[], obstructions: string[] }}
 */
export function projectAgentBriefing({ agencyRoot, holder, principal, instance }) {
  const agency = agencyAt(path.resolve(agencyRoot));
  const obstructions = [];
  const seats = [...agency.incumbencies.values()].filter((seat) => seat.holder === holder);
  if (seats.length === 0) obstructions.push(`${holder} holds no office in ${agencyRoot}`);
  const readings = seats.map((seat) => {
    const office = [...agency.offices.values()].find((o) => o.id === seat.office);
    if (office === undefined) { obstructions.push(`seat names missing office ${seat.office}`); return undefined; }
    return { office, reading: officeReading(agency, office.key), record: raw(agency, office) };
  }).filter(Boolean);

  const lines = [];
  lines.push(`# Briefing for ${principal}'s assistant`, "");
  lines.push(`You assist ${principal} on **${instance.name}** (${instance.title}). This briefing is projected from the instance's records; ${principal} and the records it cites are the authority, not this text.`, "");
  const lead = readmeLead(agency.root);
  const sectionLeads = readings.map(({ office }) => readmeLead(path.join(agency.root, office.sectionPath))).filter(Boolean);
  if (lead || sectionLeads.length) {
    lines.push("## What this is", "");
    for (const text of [...new Set([lead, ...sectionLeads].filter(Boolean))]) lines.push(text, "");
  }
  for (const { office, reading, record } of readings) {
    lines.push(`## ${principal}'s office: ${office.name ?? office.id}`, "");
    if (record["normative-structure"] || record.charter) lines.push(record["normative-structure"] ?? record.charter, "");
    if (reading.duties.length) {
      lines.push("### Duties", "");
      for (const duty of reading.duties) {
        const record = [...agency.duties.values()].find((d) => d.id === duty.id);
        const body = raw(agency, record);
        const list = (values) => (Array.isArray(values) ? values.join("; ") : "");
        lines.push(`- **${record?.name ?? duty.id}.** ${body["required-act-or-state"] ?? ""}${body["receiver-condition"] ? ` Done when: ${body["receiver-condition"]}` : ""}`
          + `${body.correlative ? ` Received by: ${body.correlative}` : ""}${list(body["required-evidence"]) ? ` Evidence: ${list(body["required-evidence"])}.` : ""}`
          + `${list(body["effect-limits"]) ? ` Limits: ${list(body["effect-limits"])}.` : ""}${body["ceo-board-relation"] ? ` CEO and Board: ${body["ceo-board-relation"]}` : ""}`
          + `${body["x-provenance"]?.source ? ` Work from: \`${body["x-provenance"].source}\`.` : ""}`);
      }
      lines.push("");
    }
    if (reading.verbs.length) lines.push("### Powers", "", `${principal}'s office grants these MetroPlat verbs, spoken in the world: ${reading.verbs.map((v) => `\`${v}\``).join(", ")}.`, "");
    // Skills are named by reference, never inlined: read one when a duty calls for it.
    if (reading.skills.length) {
      lines.push("### Skills", "", `Read a skill when a duty calls for it: \`read <skill>\` in the world loads its full method.`, "");
      for (const skill of reading.skills) {
        const record = [...agency.skills.values()].find((candidate) => candidate.id === skill.id);
        const summary = String(record?.description ?? raw(agency, record).description ?? raw(agency, record).body?.replace(/^#[^\n]*\n+/u, "") ?? "").replace(/\s+/gu, " ").trim().split(/(?<=\.)\s/u)[0];
        lines.push(`- **${skill.id}**${summary ? ` — ${summary}` : ""} Load: \`read ${record?.key ?? skill.id}\`${record?.source ? ` or \`${record.source}\`` : ""}.`);
      }
      lines.push("");
    }
  }
  lines.push("## How to connect", "");
  lines.push(`- MCP server: \`${instance.origin}/mcp\`. Add it to your MCP client; ${principal} signs in and approves you, and you then act as ${principal}, with exactly ${principal}'s powers.`);
  lines.push("- Enter with `metroplat_world-connect`, then speak with `metroplat_world-command` (`{\"line\": \"...\"}`): `report` goes to the office, `look` describes where you are, `powers` lists what you may do, `account` shows the office, duties and verbs.");
  lines.push("- `lspace_search` and `lspace_fetch` read the instance's knowledge garden: the notes the duties cite live there.", "");
  lines.push("## How to work", "");
  lines.push(`- Read the note a duty cites before acting on it, and cite it when you answer ${principal}.`);
  lines.push("- Never write in the shared checkout of the repository: it is the node's live data root, and another session's code runs from it. Open a worktree of your own (a detached worktree at origin/main under ~/.local/state/561-group/, opened with the house rail's `open-worktree`), work and commit there, and land through the merge queue (`land-candidate`). Never stash, reset, checkout, pull, merge or rebase in the shared checkout.");
  lines.push(`- Never invent a fact about ${principal}, a date, a credential, a price or a law; say what the records do not hold and ask.`);
  lines.push(`- Drafts are drafts: only ${principal} signs, files, quotes, publishes or pays.`);
  lines.push(`- When ${principal} names something to do, open it on the board with \`work-open\` (the need is a goal, a state of the world that holds when it is met; stuck work is a \`report\` with \`obstacle\` and \`obstructs\`; a \`propose\` names \`addresses\` or \`serves\`) and read your agenda and dues; when you admit it as a structured work intent (\`structured-work-intent-admit\`) pass its \`need\`; when its condition holds, discharge it (\`work-discharge-admit\`).`, "");
  return Object.freeze({ markdown: `${lines.join("\n").trim()}\n`, offices: readings.map(({ office }) => office.id), obstructions: Object.freeze(obstructions) });
}
