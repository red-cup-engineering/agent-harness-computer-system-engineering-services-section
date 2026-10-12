#!/usr/bin/env node
// conductor-mcp.mjs -- the conductor's COGNITIVE MCP: tools to THINK, not to act in-repo (my normal
// tools do that, captured via hooks). INWARD verbs operate on the memory lattice with NO network;
// OUTWARD verbs use the swarm/endpoints. The four DREAMS are a regime tower: finite (recombine) <
// scott-continuous (consolidate evidence) < transfinite (new predicates) < aperiodic (LLM, new facts).
// Thin MCP stdio transport; .mcp.json registration activates next session (fake via --demo until then).

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync } from "node:fs";

import finiteDreaming from "#script/finite-dreaming";
import scottContinuousDreaming from "#script/scott-continuous-dreaming";
import transfiniteDreaming from "#script/transfinite-dreaming";
import aperiodicDreaming from "#script/aperiodic-dreaming";
import remembering from "#script/remembering";
import wondering from "#script/wondering";
import imagining from "#script/imagining";
import ruminating from "#script/ruminating";
import exploring from "#script/exploring";
import { swarmStudy } from "#lifecycle";
import { reader } from "#enactors";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CC = "articulating/library/aperiodic-articulation-category/hacking/library/claude-code";
const MEMORY_LOG = join(ROOT, `${CC}/hacking/library/memory/memory.jsonl`);
const CAPTURE_LOG = join(ROOT, `${CC}/capturing/capturing.jsonl`);
const readLog = (p) => existsSync(p)
  ? readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  : [];

export const TOOLS = [
  { name: "remember", description: "Inward: recognition-weighted recall of settled memory for a query." },
  { name: "wonder", description: "Inward: surface open questions (contradictions/gaps) from memory." },
  { name: "imagine", description: "Inward: hypothetical recombinations of known claims (low trust)." },
  { name: "ruminate", description: "Inward: bounded re-derivation over one subject (self-reflection)." },
  { name: "finite-dreaming", description: "Inward dream (k<w): recombine memory by local derivation. No network." },
  { name: "scott-continuous-dreaming", description: "Inward dream (k=w): consolidate evidence per cell to the directed-sup limit. No network." },
  { name: "transfinite-dreaming", description: "Inward dream (w<k<w1): derive new predicates from co-occurrence. No network." },
  { name: "aperiodic-dreaming", description: "Outward dream (k>=w1): channel NEW facts via the LLM. NETWORK." },
  { name: "inquire", description: "Outward: pose a subject for the swarm to study (network)." },
  { name: "derive", description: "Outward: demand the swarm settle a specific claim (network)." },
  { name: "explore", description: "Outward: sensing drones crawl the environment for a subject (network)." }
];

const MEMBERS = [{ id: "agent-1" }, { id: "agent-2" }, { id: "agent-3" }, { id: "agent-4" }];
const demoRead = (a) => ({ value: a.id === "agent-2" ? "false" : "true", evidence: [`${a.id}:read`] });

export async function handleToolCall(name, args = {}) {
  const mem = readLog(MEMORY_LOG);
  switch (name) {
    case "remember": return { tool: name, recalled: remembering(String(args.query ?? ""), mem).slice(0, 12) };
    case "wonder": return { tool: name, questions: wondering(mem).slice(0, 12) };
    case "imagine": return { tool: name, hypotheses: imagining(mem, { limit: 8 }) };
    case "ruminate": return { tool: name, ...ruminating(String(args.subject ?? ""), mem) };
    case "finite-dreaming": return { tool: name, derived: finiteDreaming(mem) };
    case "scott-continuous-dreaming": return { tool: name, derived: scottContinuousDreaming(mem) };
    case "transfinite-dreaming": return { tool: name, derived: transfiniteDreaming(mem) };
    case "aperiodic-dreaming": {
      const xs = readLog(CAPTURE_LOG).filter((r) => r.a === "uttered").map((r) => String(r.v).slice(0, 400)).slice(-15);
      return { tool: name, derived: await aperiodicDreaming(xs.length ? xs : ["claude-code harness"], { provider: args.provider ?? "groq" }) };
    }
    case "inquire": return { tool: name, studied: swarmStudy(String(args.subject ?? "subject"), MEMBERS, demoRead, { budget: 6, threshold: 0.5 }).studied };
    case "derive": return { tool: name, studied: swarmStudy(String(args.goal ?? "goal"), MEMBERS, demoRead, { budget: 6, threshold: 0.5 }).studied };
    case "explore": return { tool: name, found: await exploring(String(args.subject ?? "subject"), reader({ provider: args.provider ?? "groq" })) };
    default: throw new Error(`conductor-mcp: unknown tool ${name}`);
  }
}

async function rpc(msg) {
  const reply = (result) => ({ jsonrpc: "2.0", id: msg.id, result });
  if (msg.method === "initialize")
    return reply({ protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "claude-code-conductor", version: "0.0.3" } });
  if (msg.method === "tools/list")
    return reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: { type: "object" } })) });
  if (msg.method === "tools/call") {
    try { return reply({ content: [{ type: "text", text: JSON.stringify(await handleToolCall(msg.params?.name, msg.params?.arguments)) }] }); }
    catch (e) { return reply({ isError: true, content: [{ type: "text", text: String(e.message) }] }); }
  }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === "--demo") {
    const inward = ["remember", "wonder", "finite-dreaming", "scott-continuous-dreaming", "transfinite-dreaming", "imagine"];
    Promise.all(inward.map(async (n) => [n, await handleToolCall(n, { query: "claude-code swarm" })]))
      .then((rs) => console.log(JSON.stringify(Object.fromEntries(rs), null, 2)));
  } else {
    // Streaming stdio transport: a live MCP client holds stdin open for the whole
    // session and expects each newline-delimited message answered as it arrives.
    // Buffer by line, and drain via a serial queue so an in-flight `await rpc()`
    // can't interleave two `data` events racing on the shared buffer.
    let buf = "";
    const queue = [];
    let draining = false;
    const drain = async () => {
      if (draining) return;
      draining = true;
      while (queue.length) {
        const out = await rpc(queue.shift());
        if (out) process.stdout.write(JSON.stringify(out) + "\n");
      }
      draining = false;
    };
    process.stdin.on("data", (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        queue.push(msg);
      }
      drain();
    });
  }
}
