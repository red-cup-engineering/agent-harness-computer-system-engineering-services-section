// The standing-block projection, its splice/unsplice mechanics on
// <node>/CLAUDE.md, and the enterprise manifest that records what
// installing-an-enterprise-in-claude did — factored out of
// install-enterprise-in-claude.mjs so this is the one place the logic is
// defined. The whole-enterprise orchestrator in that file is the only
// caller today; a future caller that needs to render, splice, or unsplice
// the block without admitting a full install can import this directly
// rather than the logic being copied a second time.

import { dirname, join, relative } from "node:path";
import * as defaultFilesystem from "node:fs";

export const BEGIN = "<!-- installing-an-enterprise-in-claude: begin -->";
export const END = "<!-- installing-an-enterprise-in-claude: end -->";

// The duty whose bearer the block names as the attesting office. Read from
// the roster, never assumed: an enterprise that seats no bearer is told so.
const ATTESTING_DUTY = "attesting-a-work-product";

function die(message) {
  throw new Error(`install-an-enterprise-in-claude: ${message}`);
}

// createEnterpriseStandingBlock binds the projection and its splice/manifest
// mechanics to one repo root and one filesystem, so every rendered path and
// every read/write lands where the caller means. repoRoot must already be
// resolved (absolute); filesystem defaults to node:fs.
export function createEnterpriseStandingBlock({ repoRoot, filesystem = defaultFilesystem }) {
  const { existsSync, readFileSync, mkdirSync, writeFileSync } = filesystem;

  function rel(p) {
    return relative(repoRoot, p) || ".";
  }

  // --- reading the records, for the roster lines and the attesting office ---

  function readSpec(office) {
    if (office.spec) return office.spec;
    try {
      office.spec = JSON.parse(readFileSync(office.record, "utf8"));
    } catch (e) {
      die(`${rel(office.record)} is unreadable: ${e.message}`);
    }
    return office.spec;
  }

  function frontmatter(file) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, "utf8"));
    return match ? match[1] : undefined;
  }

  // Reads `key: value` and the block-scalar forms (`key: >` / `key: |`), as
  // the sibling installer reads them: frontmatter records are written by hand
  // in both shapes, so both are read; folded lines join with spaces.
  function frontmatterText(file, key) {
    const fm = frontmatter(file);
    if (!fm) return undefined;
    const block = new RegExp(`^${key}:[ \\t]*[>|][+-]?[ \\t]*\\r?\\n((?:[ \\t]+.*\\r?\\n?|[ \\t]*\\r?\\n)+)`, "m").exec(fm);
    if (block) {
      return block[1].split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
    }
    const scalar = new RegExp(`^${key}:[ \\t]*(.+)$`, "m").exec(fm);
    return scalar ? scalar[1].trim() : undefined;
  }

  function frontmatterList(file, key) {
    const fm = frontmatter(file);
    if (!fm) return [];
    const inline = new RegExp(`^${key}:[ \\t]*\\[(.*)\\][ \\t]*$`, "m").exec(fm);
    if (inline) return inline[1].split(",").map((s) => s.trim()).filter(Boolean);
    const block = new RegExp(`^${key}:[ \\t]*\\r?\\n((?:[ \\t]*-[ \\t]*.+\\r?\\n?)+)`, "m").exec(fm);
    if (block) {
      return block[1]
        .split("\n")
        .map((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim())
        .filter(Boolean);
    }
    return [];
  }

  function firstSentence(text) {
    const s = String(text ?? "").trim();
    return s ? s.split(/(?<=\.)\s/)[0] : "";
  }

  // The roster line's description: a canonical record's first sentence of
  // normative-structure, or a frontmatter office's first sentence of
  // description. A record that yields no sentence is refused — a roster line
  // with no description delegates nothing.
  function describe(office) {
    if (office.record.endsWith(".json")) {
      const spec = readSpec(office);
      if (spec.kind !== "office") {
        die(`${rel(office.record)} declares 'kind: ${spec.kind ?? "(nothing)"}' — refusing to install an enterprise around a non-office.`);
      }
      return firstSentence(spec["normative-structure"]) || firstSentence(spec.description) || `The ${spec.name ?? office.id} office.`;
    }
    const sentence = firstSentence(frontmatterText(office.record, "description"));
    if (!sentence) die(`${rel(office.record)} yields no sentence — it has no 'description:' in its frontmatter, and a roster line with no description delegates nothing.`);
    return sentence;
  }

  // A canonical office names its duties in bears-duty, each by full address;
  // a frontmatter office names them bare in duties:. Same assignment
  // mechanism, two spellings — the sibling installer's rule exactly.
  function officeDuties(office) {
    if (Array.isArray(office.duties)) return office.duties;
    if (office.record.endsWith(".json")) {
      const bears = readSpec(office)["bears-duty"];
      return (Array.isArray(bears) ? bears : []).map((a) => a.replace(/^emsenn\/duty\//, ""));
    }
    return frontmatterList(office.record, "duties");
  }

  // --- the standing block: a deterministic projection of the enterprise ---

  function renderBlock(enterprise, offices) {
    // The attesting office is read from the roster, never assumed. An
    // enterprise that seats no bearer of the duty is told exactly that.
    const attesters = offices.filter((o) => officeDuties(o).includes(ATTESTING_DUTY)).map((o) => o.id);
    const agency = join(enterprise, "lib/agency");
    const lines = [
      BEGIN,
      "# This node holds an enterprise",
      "",
      `The enterprise seats at \`${rel(enterprise)}\`. Every office on its roster is`,
      "installed at this node as a subagent — one file per office under `.claude/agents/` —",
      "and the session opened here holds NO office itself. It is the dispatcher: it decides",
      "where work goes, and it does not do the offices' work.",
      "",
      "## The records",
      "",
      `The enterprise's offices, duties, works, skills, characters and incumbencies are its agency`,
      `records, in \`${rel(agency)}/<pool>/\`, read with every other section's by the one agency`,
      "registry. MetroPlat serves them: `offices`, `office` and `account` read an office, its",
      "duties, skills and verbs, and what the caller holds.",
      "",
      "## The enterprise membrane",
      "",
      "Protocol scale is not interchangeable. A2A is the coordination face among offices",
      "and agents within this enterprise. ActivityPub is the messaging face between this",
      "sovereign enterprise and another one. Receiving an ActivityPub message may create",
      "local work only through this enterprise's own admission and authority; a sender",
      "never writes this enterprise's records. No umbrella platform participates in this",
      "boundary; each required faculty is hired from its sovereign owner.",
      "",
      "## The delegation rule",
      "",
      "Work belongs to the office that owes it — delegate to the installed agent rather",
      "than doing an office's work at the root. Work moves through MetroPlat's work verbs:",
      "",
      "- open board work with `work-open`: a request's need is a goal (a state of the world that",
      "  holds when it is met, never an imperative activity); when something stands in the way,",
      "  play a `report` with `obstacle` and `obstructs`, never a request for staff; a `propose`",
      "  names `addresses` or `serves`; read your agenda and dues for what you owe",
      "- raise work against a duty with `structured-work-intent-admit`, passing its `need` (the goal)",
      "- dispatch it to the office that owes it with `agent-work-dispatch`",
      "- discharge it, with its evidence, with `work-discharge-admit`",
      "",
      "## The obligation loop",
      "",
      '"Fulfill the obligations of your office" resolves here with no other context:',
      "",
      "1. At session start, read the open work with MetroPlat's `work-item` and `duties`:",
      "   work is open while its goal is unachieved, and achievement is derived from the",
      "   evidence, never read from any record.",
      "2. Work each open item by delegating it to the office that owes it.",
      ...(attesters.length
        ? [
            "3. The worker never verifies its own work. Attestation belongs to",
            `   ${attesters.join(", ")} (${ATTESTING_DUTY}).`,
          ]
        : [
            "3. The worker never verifies its own work. This enterprise seats no office",
            `   bearing ${ATTESTING_DUTY} — the operator is the witness.`,
          ]),
      "",
      "## The roster",
      "",
      ...offices.map((office) => `- **${office.id}** — ${describe(office)}`),
      END,
    ];
    return lines.join("\n") + "\n";
  }

  // --- splicing the block into <node>/CLAUDE.md ---

  function markerIndices(text, file) {
    const b = text.indexOf(BEGIN);
    const e = text.indexOf(END);
    if ((b === -1) !== (e === -1)) {
      die(`${rel(file)} holds one marker of the pair and not the other — a torn block is a contradiction to name, not a thing to repair silently.`);
    }
    if (b !== -1 && (text.indexOf(BEGIN, b + 1) !== -1 || text.indexOf(END, e + 1) !== -1)) {
      die(`${rel(file)} holds a marker of the pair more than once — one block, one pair; anything else is a contradiction to name.`);
    }
    if (b !== -1 && e < b) {
      die(`${rel(file)} holds its end marker before its begin marker — a torn block is a contradiction to name, not a thing to repair silently.`);
    }
    return { b, e };
  }

  // Three splice modes, and the mode is a fact the manifest records so that
  // clean undoes exactly what the splice did: "created" (the file is the
  // block), "separator" (one newline was added, then the block), "in-place"
  // (the block replaced a block between markers that were already there, and
  // no byte on either side is this mechanism's to touch).
  function spliceBlock(file, block) {
    if (!existsSync(file)) return { next: block, mode: "created" };
    const text = readFileSync(file, "utf8");
    const { b, e } = markerIndices(text, file);
    if (b === -1) return { next: text + "\n" + block, mode: "separator" };
    let tail = e + END.length;
    if (text[tail] === "\n") tail++;
    return { next: text.slice(0, b) + block + text.slice(tail), mode: "in-place" };
  }

  // The inverse, by recorded mode. Returns null when no block is present.
  function removeBlock(text, file, mode) {
    const { b, e } = markerIndices(text, file);
    if (b === -1) return null;
    let tail = e + END.length;
    if (text[tail] === "\n") tail++;
    let head = b;
    if (mode === "separator" && head > 0 && text[head - 1] === "\n") head--;
    return text.slice(0, head) + text.slice(tail);
  }

  // --- manifest: what this mechanism installed here, so clean is exact ---

  function manifestPath(node) {
    return join(node, ".claude/.claude-enterprise-manifest");
  }

  function readManifest(node) {
    const file = manifestPath(node);
    if (!existsSync(file)) return [];
    return readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean);
  }

  function writeManifest(node, entries) {
    mkdirSync(dirname(manifestPath(node)), { recursive: true });
    writeFileSync(manifestPath(node), [...entries].sort().map((e) => `${e}\n`).join(""));
  }

  function isBlockEntry(entry) {
    return entry === "CLAUDE.md" || entry.startsWith("CLAUDE.md:");
  }

  // One entry recorded the moment its fact is true — each office AS it
  // installs, the block AS it splices — so a mid-roster failure leaves a
  // manifest that names exactly the residue, and clean can sweep it.
  function recordInManifest(node, entry) {
    const entries = readManifest(node).filter((e) => (isBlockEntry(entry) ? !isBlockEntry(e) : e !== entry));
    writeManifest(node, [...entries, entry]);
  }

  return {
    renderBlock,
    markerIndices,
    spliceBlock,
    removeBlock,
    manifestPath,
    readManifest,
    writeManifest,
    isBlockEntry,
    recordInManifest,
  };
}
