/**
 * @module house-context
 * The Group's binding rules, standing Leader decisions, open carriers and the "before asking the
 * Leader" checklist, projected from the 561 Group's own records into an agent session.
 *
 * Why this exists: on 2026-10-25 a coordinating session asked the Leader whether to enable GCP billing,
 * for a wallet, for Oracle hosting and for how to clear the market deploy gate, each held by the house
 * (rule github-actions-use-held-runners-without-billing, requirement group-work-continues-on-zero-cash-compute,
 * the host .env files, red-cup-engineering/market.561.group#4), because nothing carried them into the
 * session. Under rule capitalized-leader-statements-mark-a-failed-carrier the repair is the carrier: the
 * harness projects the records. AGENTS.md is the Leader's own and is not a carrier.
 *
 * Nothing here is hand-copied text. The record `data/records/session-projection-records/agent-session-projection.json`
 * of the 561 Group services section names WHICH rules, requirements, carriers and checks a session needs;
 * every statement is read from the rule or requirement record it names, clipped, never reworded. The same
 * records give the same text (carrier states aside, which are read live from GitHub, cached, and absent
 * offline). Output is held to a strict budget so it can ride in every session.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { execFile } from "node:child_process";
import { readServiceState, writeServiceState } from "@red-cup-engineering/computer-systems-logging-engine/service-state";
import { sectionRootOf } from "./section-root.mjs";
import path from "node:path";

/** Where the 561 Group services section sits in a working tree of the Group. */
export const SECTION_PATH = "services/internal-services-section";
export const PROJECTION_RECORD = "data/records/session-projection-records/agent-session-projection.json";
export const CACHE_SECONDS = 600;
/** Characters of context each event may carry (Claude Code caps a hook's context at 10,000). */
export const BUDGETS = Object.freeze({ SessionStart: 8000, SubagentStart: 5400, UserPromptSubmit: 1800 });
export const HOOK_FILE = "house-context-hook.mjs";

const WORD = /\S+/gu;
const flat = (text) => String(text ?? "").replace(/\s+/gu, " ").trim();

/** `text` cut at a word boundary within `width` characters, ending in an ellipsis when cut. */
export function clip(text, width) {
  const one = flat(text);
  if (one.length <= width) return one;
  const cut = one.slice(0, width - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > width * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:(]+$/u, "")}…`;
}

/** The first sentence of a statement ("MUST ... ." up to the first full stop followed by a capital). */
export function firstSentence(text) {
  const one = flat(text);
  const stop = /\.(?=\s+[A-Z"“(])/u.exec(one);
  return stop ? one.slice(0, stop.index + 1) : one;
}

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const tryJson = (file) => { try { return readJson(file); } catch { return undefined; } };

/**
 * The 561 Group services section of the working tree holding `cwd`, or undefined when `cwd` is outside
 * every tree. `trees` are directories of the machine (arguments of the installed hook), compared by real path.
 */
export function sectionFor(cwd, trees, { section } = {}) {
  if (section !== undefined) return existsSync(section) ? path.resolve(section) : undefined;
  let here;
  try { here = realpathSync(cwd); } catch { return undefined; }
  for (const tree of trees) {
    let root;
    try { root = realpathSync(tree); } catch { continue; }
    if (here === root || here.startsWith(`${root}${path.sep}`)) {
      const found = path.join(root, SECTION_PATH);
      return existsSync(found) ? found : undefined;
    }
  }
  return undefined;
}

/** `gh api` for one issue or pull request; retried without ambient tokens when gh calls the token invalid. */
function ghIssue(repo, number, { timeout = 5000, run = execFile } = {}) {
  const jq = "{state:.state,title:.title,updated:.updated_at,pull:(.pull_request!=null),merged:(.pull_request.merged_at)}";
  const attempt = (env) => new Promise((resolve, reject) => {
    run("gh", ["api", `repos/${repo}/issues/${number}`, "--jq", jq], { timeout, env, maxBuffer: 1 << 16 }, (error, stdout) => {
      if (error) reject(error); else { try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); } }
    });
  });
  const bare = { ...process.env }; delete bare.GH_TOKEN; delete bare.GITHUB_TOKEN;
  return attempt(process.env).catch(() => attempt(bare));
}

/**
 * Live state of each carrier `{ repo, number }`, through a short cache kept as the section's `house-context` service state (no `root`, no cache). Offline (or with `offline`)
 * it answers the last cached reading, marked stale, or nothing: a carrier that cannot be read is still
 * listed from its record. Never throws.
 */
export async function readCarriers(carriers, { root, now = Date.now(), offline = false, fetchOne = ghIssue, deadline = 6000, ttl = CACHE_SECONDS } = {}) {
  const cache = (root !== undefined && readServiceState({ root, service: "house-context" })) || {};
  const fresh = new Map(), stale = new Map();
  const wanted = [];
  for (const { repo, number } of carriers) {
    const key = `${repo}#${number}`, held = cache[key];
    if (held && now - Date.parse(held.at) < ttl * 1000) fresh.set(key, held.data);
    else { if (held) stale.set(key, held.data); wanted.push({ repo, number, key }); }
  }
  const got = new Map();
  if (!offline && wanted.length > 0) {
    const reads = Promise.all(wanted.map(({ repo, number, key }) => Promise.resolve().then(() => fetchOne(repo, number)).then((data) => { if (data) got.set(key, data); }, () => {})));
    await Promise.race([reads, new Promise((resolve) => { setTimeout(resolve, deadline).unref?.(); })]);
    if (root !== undefined && got.size > 0) {
      const at = new Date(now).toISOString();
      const next = { ...cache };
      for (const [key, data] of got) next[key] = { at, data };
      try { writeServiceState({ root, service: "house-context", at, value: next }); } catch { /* an unwritable cache only costs the next read */ }
    }
  }
  const states = new Map();
  for (const { repo, number } of carriers) {
    const key = `${repo}#${number}`;
    if (got.has(key)) states.set(key, { ...got.get(key), read: "live" });
    else if (fresh.has(key)) states.set(key, { ...fresh.get(key), read: "cached" });
    else if (stale.has(key)) states.set(key, { ...stale.get(key), read: "stale" });
  }
  return states;
}

/** Everything the record names, read from the section; `problems` lists what could not be read. */
export function readHouse(section) {
  const problems = [];
  const projection = tryJson(path.join(section, PROJECTION_RECORD));
  if (projection === undefined) return Object.freeze({ projection: undefined, rules: new Map(), requirements: new Map(), queue: undefined, problems: [`${PROJECTION_RECORD} is missing or unreadable at ${section}`] });
  const rules = new Map(), requirements = new Map();
  const wantRule = (id) => { if (!rules.has(id)) { const rule = tryJson(path.join(section, "lib/agency/rules", `${id}.json`)); if (rule) rules.set(id, rule); else problems.push(`rule ${id} is named by the projection record and not found`); } };
  for (const topic of projection.rules ?? []) for (const item of topic.items ?? []) wantRule(item.id);
  if (projection.correction?.rule) wantRule(projection.correction.rule);
  for (const { id } of projection.requirements ?? []) {
    const requirement = tryJson(path.join(section, "lib/agency/requirements", `${id}.json`));
    if (requirement) requirements.set(id, requirement); else problems.push(`requirement ${id} is named by the projection record and not found`);
  }
  const queue = projection["decision-queue"] ? tryJson(path.join(section, projection["decision-queue"])) : undefined;
  if (projection["decision-queue"] && queue === undefined) problems.push(`decision queue ${projection["decision-queue"]} not readable`);
  return Object.freeze({ projection, rules, requirements, queue, problems });
}

const day = (stamp) => String(stamp ?? "").slice(0, 10);

function carrierLine(carrier, state) {
  const ref = `${carrier.repo}#${carrier.number}`;
  if (state === undefined) return `- ${ref} (state unread): ${carrier.binds ?? ""}`.trimEnd();
  const standing = state.merged ? "merged" : state.state === "closed" ? "closed" : "open";
  const kind = state.pull ? "PR" : "issue";
  return `- ${ref} [${kind} ${standing}${state.read === "stale" ? ", stale reading" : ""}, ${day(state.updated)}] ${clip(state.title, 72)}`;
}

/**
 * The context for one hook event. `profile` is the event's name; the sub-agent profile is shorter
 * (statements only, no carrier states) because it rides in every sub-agent.
 * @returns {{ text: string, problems: string[], truncated: boolean }}
 */
export function renderHouseContext({ house, carrierStates = new Map(), event = "SessionStart", scriptPath, trees = [] }) {
  // Shrink the rule statements, never drop a section, until the text fits its event's budget.
  let result;
  for (const scale of [1, 0.9, 0.8, 0.7, 0.6, 0.5]) {
    result = renderAt({ house, carrierStates, event, scriptPath, trees, scale });
    if (!result.over) break;
  }
  return result.over ? finish(result.text, BUDGETS[event] ?? BUDGETS.SessionStart, result.problems) : { text: result.text, problems: result.problems, truncated: false };
}

function finish(text, budget, problems) {
  return { text: `${text.slice(0, budget - 100).replace(/\s+\S*$/u, "")}\n[truncated at ${budget} characters: shorten the projection record, do not raise the budget]`, problems, truncated: true };
}

function renderAt({ house, carrierStates, event, scriptPath, trees, scale }) {
  const { projection, rules, requirements, queue, problems } = house;
  const budget = BUDGETS[event] ?? BUDGETS.SessionStart;
  if (projection === undefined) {
    return { over: false, text: `HOUSE CONTEXT could not be projected: ${problems.join("; ")}. This is a failed carrier. The current request remains the work. Recover only a missing source prerequisite needed to execute it; this failure does not authorize a backlog, archive or campaign survey.`, problems, truncated: false };
  }
  const compact = event === "SubagentStart";
  const lines = [];
  const out = (...more) => lines.push(...more);

  out(`HOUSE CONTEXT, projected by the agent harness from the 561 Group's records (${PROJECTION_RECORD}); the records are the authority.`);
  out("The current user request defines the work. Apply these records when relevant to that request. Existing carriers are references: their presence does not authorize unrelated work. Recover only context needed for the next concrete action.", "");

  out("BINDING RULES (read the record by id when it applies)");
  for (const topic of projection.rules ?? []) {
    out(`${topic.topic}:`);
    for (const item of topic.items ?? []) {
      const rule = rules.get(item.id);
      if (!rule) continue;
      out(`- [${item.id}] ${clip(firstSentence(rule.statement), Math.floor((compact ? item.compact ?? Math.min(item.width ?? 170, 150) : item.width ?? 170) * (item.keep ? 1 : scale)))}`);
    }
  }
  out("");

  out("STANDING LEADER DECISIONS");
  for (const { id, topic } of projection.requirements ?? []) {
    const requirement = requirements.get(id);
    if (!requirement) continue;
    const budgetLine = requirement.budget
      ? `${topic ?? requirement.name}: ${Object.entries(requirement.budget).map(([k, v]) => `${k} ${v}`).join("; ")}`
      : `${topic ?? requirement.name}`;
    out(`- ${clip(budgetLine, 240)} [requirement ${id}]`);
  }
  if (queue?.items) {
    const waiting = queue.items.filter((item) => !/^deferred/iu.test(item.state ?? "") && !/^(done|closed)/iu.test(item.state ?? ""));
    const deferred = queue.items.filter((item) => /^deferred/iu.test(item.state ?? ""));
    for (const item of deferred) out(`- Leader decision on ${item.id}: ${clip(item.state, 110)}`);
    out(compact
      ? `- ${waiting.length} items already wait on the Leader in ${projection["decision-queue"]}; do not ask for them again.`
      : `- Waiting on the Leader already, queued in ${projection["decision-queue"]}: ${waiting.map((item) => item.id).join(", ") || "nothing"}. Add what needs the Leader there; do not ask in chat, and do not ask again for what is queued.`);
  }
  out("");

  const carriers = projection.carriers ?? [];
  if (carriers.length > 0) {
    out(`EXISTING CARRIERS: continue only a carrier that owns the current request; avoid duplicate work${compact ? "" : " (cached states; live refresh requires explicit selection)"}`);
    for (const carrier of carriers) out(carrierLine(carrier, compact ? undefined : carrierStates.get(`${carrier.repo}#${carrier.number}`)));
    for (const brief of projection.briefs ?? []) {
      const state = carrierStates.get(`${brief.repo}#${brief.number}`);
      const landed = state?.merged !== null && state?.merged !== undefined;
      out(`- Session brief: ${landed ? `in the MetroPlat world type \`${brief.verb}\`` : `\`${brief.verb}\` once ${brief.repo}#${brief.number} lands (${state ? state.state : "unread"}); until then read the duty, skill and runbook records`}.`);
    }
    out("");
  }

  out("BEFORE ASKING THE LEADER: CHECK APPLICABLE SOURCES FOR THE CURRENT REQUEST");
  (projection.checklist ?? []).forEach((item, index) => out(`${index + 1}. ${clip(item, compact ? 130 : 240)}`));
  if (!compact) out("Ask only a matter of preference or a choice the house's research cannot decide, with your recommendation, and queue it in the decision queue.");
  out("");

  if (projection.correction && !compact) {
    const { rule: ruleId, skill, runbook } = projection.correction;
    const rule = rules.get(ruleId);
    out(`CAPITALS: ${rule ? `[${ruleId}] ${flat(rule.statement)}` : `[${ruleId}] rule unavailable; recover its source before determining the response.`} Reference: skill ${skill}${runbook ? ` and runbook ${runbook}` : ""}.`);
  }
  if (compact) out("You are a sub-agent: this was injected for you. Do not ask the Leader anything; return what you could not decide to your caller.");
  else if (scriptPath) out(`Sub-agents get a shorter projection (SubagentStart). If this context is ever missing, run: node ${scriptPath}`);
  if (problems.length > 0) out("", `Projection problems (repair the records): ${problems.join("; ")}`);

  const text = lines.join("\n");
  return { over: text.length > budget, text, problems };
}

/** Words the Leader's capitals are never about: acronyms and file names common in prompts. */
const ACRONYMS = new Set(["HTTP", "HTTPS", "API", "CLI", "MCP", "URL", "URI", "JSON", "HTML", "CSS", "SQL", "EOF", "TODO", "README", "AGENTS", "PR", "CI", "CD", "GCP", "AWS", "USDC", "NPM", "PNPM", "GIT", "SSH", "TLS", "DNS", "CPU", "RAM", "GPU", "LLM", "UTC", "YAML", "TOML", "SHA", "ID", "OK", "OS", "VM", "VPS", "EVM", "ERC", "NFT", "KYC", "ENV", "MAIN", "HEAD", "FIXME", "NOTE", "WARN", "ERROR", "INFO", "DEBUG", "FATAL"]);

/**
 * Whether a prompt is a capitalized Leader statement: a run of at least four capitalized words, three
 * or more of them of three letters or more, outside code, links and acronym lists. The match is only a
 * trigger for the carrier-repair instruction; it carries no judgement of what the capitals say.
 */
export function detectCapitalizedStatement(prompt) {
  const prose = String(prompt ?? "").replace(/```[\s\S]*?```/gu, " ").replace(/`[^`\n]*`/gu, " ").replace(/\bhttps?:\/\/\S+/gu, " ");
  let run = [];
  const best = [];
  const finish = () => { if (run.length >= 4 && run.filter((word) => word.length >= 3).length >= 3) best.push(run); run = []; };
  for (const token of prose.match(WORD) ?? []) {
    const word = token.replace(/^[^\p{L}]+|[^\p{L}']+$/gu, "");
    const capital = word.length >= 2 && word === word.toUpperCase() && /^\p{Lu}[\p{Lu}']*$/u.test(word) && !ACRONYMS.has(word);
    // "I" joins a run it does not start; a run ends on any lowercase word, not at a full stop.
    if (capital || (word === "I" && run.length > 0)) run.push(word);
    else finish();
  }
  finish();
  if (best.length === 0) return { matched: false };
  const longest = best.sort((a, b) => b.length - a.length)[0];
  return { matched: true, words: longest.length, excerpt: clip(longest.join(" "), 120) };
}

/** The instruction injected with a capitalized prompt, from the rule, skill and runbook the record names. */
export function renderCapitalsInstruction({ house, excerpt }) {
  const correction = house.projection?.correction;
  const rule = correction ? house.rules.get(correction.rule) : undefined;
  const lines = [
    `The Leader wrote in capitals${excerpt ? ` ("${excerpt}")` : ""}.`,
    rule ? `${rule.id}: ${flat(rule.statement)}` : "The correction rule is unavailable; recover its source before determining the response.",
  ];
  if (correction) lines.push(`Reference: skill ${correction.skill}${correction.runbook ? `; runbook ${correction.runbook}` : ""}.`);
  const text = lines.join("\n");
  return text.length <= BUDGETS.UserPromptSubmit ? text : `${text.slice(0, BUDGETS.UserPromptSubmit - 1)}…`;
}

/** The hook reply for one event. */
export const hookOutput = (event, text) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } })}\n`;


/**
 * The context for `event` at `cwd`, or undefined when `cwd` is outside the Group's working trees
 * (the hook is installed for a user, and projects nothing into their other work).
 */
export async function projectHouseContext({ event, cwd, prompt, trees, section, offline = false, liveCarriers = false, root = sectionRootOf(), fetchOne, scriptPath, now }) {
  const found = sectionFor(cwd, trees, { section });
  if (found === undefined) return undefined;
  const house = readHouse(found);
  if (event === "UserPromptSubmit") {
    const verdict = detectCapitalizedStatement(prompt);
    return verdict.matched ? renderCapitalsInstruction({ house, excerpt: verdict.excerpt }) : undefined;
  }
  const carriers = event === "SubagentStart" ? [] : house.projection?.carriers?.concat(house.projection?.briefs ?? []) ?? [];
  const carrierStates = carriers.length > 0 ? await readCarriers(carriers, { root, offline: offline || !liveCarriers, fetchOne, now }) : new Map();
  return renderHouseContext({ house, carrierStates, event, scriptPath, trees }).text;
}
