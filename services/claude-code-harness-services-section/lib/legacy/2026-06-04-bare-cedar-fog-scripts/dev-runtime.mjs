import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  admittedOrganizingTheatreActionActivities as projectAdmittedMashActionActivities,
  organizingTheatreActivityForEvent,
  organizingTheatreActivityAddressedTo as activityAddressedTo,
  organizingTheatreAgentEventsFromWitnessRows,
  organizingTheatreActiveWorkLocusClaims,
  organizingTheatreAgentActorId,
  organizingTheatreAgentLocus,
  organizingTheatreAgentActorSession,
  organizingTheatreAgentActorsForLoci,
  organizingTheatreAgentActorsForEvents,
  organizingTheatreAgentSessionHandoffResource,
  organizingTheatreAgentSessionHandoff as projectMashAgentSessionHandoff,
  organizingTheatreAgentSignal as projectMashAgentSignal,
  organizingTheatreActivityPubActorResource,
  organizingTheatreActivityPubFederationProjection,
  organizingTheatreActivityPubOutboxResource,
  organizingTheatreCapabilityField,
  organizingTheatreCollisionAwarenessFor,
  organizingTheatreInstanceProfile,
  organizingTheatreIsActivity as isActivity,
  organizingTheatreLatestRecordedAgentSessionHandoff,
  organizingTheatreModeledAgentSemioticHub,
  organizingTheatreModeledRelations,
  organizingTheatreServiceProjection,
  organizingTheatreStrongestPathOverlap,
  organizingTheatreWorkLocusCapability,
  organizingTheatreWorkLocusCapabilityGrant,
  organizingTheatreWorkLocusCapabilitySignal,
  organizingTheatreWorkLocusClaimFrom,
  organizingTheatreWorkLocusClaimConflictsAcross,
  organizingTheatreWorkLocusClaimConflictsFor,
  claimWorkLocus,
  governWorkLocusClaims,
  situation,
} from "@emsenn/organizing";
import { grepAddressedText } from "@emsenn/organizing-a-knowledge-vault/addressing";
import { readWitnessLog } from "@emsenn/relating/ledger";
import { invocationStore, witnessInvocation } from "@emsenn/relating/running";

export const MODULE_PATH = fileURLToPath(import.meta.url);
export const SITE_ROOT = path.resolve(path.dirname(MODULE_PATH), "..");
export const REPO_ROOT = path.resolve(SITE_ROOT, "../..");
export const ICK_ROOT = process.env.DEV_BARE_CEDAR_FOG_ICK_ROOT === undefined
  ? SITE_ROOT
  : path.resolve(process.env.DEV_BARE_CEDAR_FOG_ICK_ROOT);
export const MASH_PROFILE = organizingTheatreInstanceProfile({
  namespace: "dev.bare-cedar-fog.emsenn.net",
  baseUrl: "https://dev.bare-cedar-fog.emsenn.net",
  name: "dev.bare-cedar-fog.emsenn.net Modeled Agent Semiotic Hub",
  preferredUsername: "mash",
  summary: "The canonical ActivityPub service actor for dev.bare-cedar-fog.emsenn.net, where workspace agents coordinate through MASH projections and admitted actions.",
  activityPubFederationClaim: "MASH sessions are ActivityPub Actors grouped into harness camps; hook/tool Activities deliver through organizing's S2S fan-out and federate through organizing's ActivityPub federation reader.",
  inboxClaim: "Inbound ActivityPub Activities are folded through animating's perceiveInbox leg, so an agent inbox is read as an agent membrane rather than as a sidecar message queue.",
});
export const MASH_SERVICE_CONFIG = MASH_PROFILE.service;
export const MASH_SERVICE_PROJECTION = organizingTheatreServiceProjection(MASH_SERVICE_CONFIG);
export const MASH_ACTOR_IRI = MASH_SERVICE_PROJECTION.actor.id;
export const MASH_OUTBOX_IRI = MASH_SERVICE_PROJECTION.outboxId;
export const ICK_SERVICE_FACE = Object.freeze({
  kind: "dev.bare-cedar-fog.emsenn.net.information-coherence-kernel-face",
  packageName: "@emsenn/organizing",
  basePath: "/ick",
  discoveryHref: "/api/information-coherence-kernel-actions.json",
  openApiHref: "/ick/openapi.json",
  mcpHref: "/ick/mcp",
  witnessLog: "ICK action invocations are witnessed through the relating serving machinery under sites/dev.bare-cedar-fog.emsenn.net/data/log/YYYY/MM/DD/YYYY-MM-DD-root-log.jsonl",
  claim: "Model endpoints, NVIDIA endpoints, local NPUs, and other frontier runtimes should be external actuators behind this service face rather than site-local provider wiring.",
});
export const ICK_JUPYTER_INFOTILE_VIEW = Object.freeze({
  kind: "dev.bare-cedar-fog.emsenn.net.ick-jupyter-infotile-view",
  dataHref: "/api/contents/data/infotile-field.jsonl",
  notebookHref: "/api/contents/notebooks/infotile-field.ipynb",
  claim: "InfoTiles are read through the ICK Jupyter contents face over the canonical RWIL witness log.",
});
export const INFOTILE_SPINE = Object.freeze({
  kind: "dev.bare-cedar-fog.emsenn.net.infotile-spine",
  claim: "InfoTiles read the dev agent theatre as a bilattice-coloured sofic tiling: information is a factor map, a factor map is a colouring, and a colouring carries bits.",
  references: Object.freeze([
    Object.freeze({
      id: "infotiles-bilattice-sofic-tilings",
      path: "dev/content/researching/papers/2026-06-26-infotiles-bilattice-sofic-tilings.md",
      claim: "Defines an InfoTile as charge colouring, aperiodic layout, cohomological invariant, spectral invariant, and information invariant.",
    }),
    Object.freeze({
      id: "coherence-kernel-sofic-factor",
      path: "dev/content/researching/notes/2026-06-26-coherence-kernel-as-sofic-factor.md",
      claim: "Names the coherence kernel as a sofic factor-map system over the RWIL witness shift valued in FOUR.",
    }),
    Object.freeze({
      id: "kernel-relational-tiling-comonad",
      path: "dev/content/researching/notes/2026-06-26-kernel-as-relational-tiling-comonad.md",
      claim: "Places the nine-faculty kernel as a relational tiling comonad and accepts the Salem residual as part of the moat.",
    }),
    Object.freeze({
      id: "dev-ick-in-site",
      path: "dev/content/researching/notes/2026-06-26-dev-emsenn-net-as-rck-in-site.md",
      claim: "Sets dev.bare-cedar-fog.emsenn.net as the reflective IN site mounting the ICK and reading its own agent theatre.",
    }),
  ]),
});
const MASH_WORK_LOCUS_OPTIONS = MASH_PROFILE.workLocus;
const ADMITTED_MASH_ACTIONS = Object.freeze([
  actionDescriptor("bridge-task", "Witness a task-bridge event in the dev ICK/RWIL field."),
  actionDescriptor("budget-guard", "Record a dev.bare-cedar-fog.emsenn.net context-budget hook reading."),
  actionDescriptor("campaign-pretool", "Record a pre-tool campaign event and claim mutating edit loci."),
  actionDescriptor("check-stop-gate", "Record the dev.bare-cedar-fog.emsenn.net local stop-gate reading."),
  actionDescriptor("claim-locus", "Claim or release a workspace locus through the dev ICK/RWIL field."),
  actionDescriptor("ingest-hook", "Admit a raw hook payload into the dev ICK/RWIL field."),
  actionDescriptor("orient-agent", "Derive a dev.bare-cedar-fog.emsenn.net orientation dossier scoped to the current agent session."),
  actionDescriptor("precompact-handoff", "Record a pre-compaction session handoff carrier."),
  actionDescriptor("read-capability-field", "Read the compact MASH ActivityPub/OCap capability field."),
  actionDescriptor("read-infotile-field", "Read the diagnostic agent/workspace InfoTile field; the web face is the ICK Jupyter InfoTile notebook."),
  actionDescriptor("read-session-handoff", "Read the current or latest MASH session handoff."),
  actionDescriptor("read-work-vocabulary", "Read the compact dev.bare-cedar-fog.emsenn.net work vocabulary."),
  actionDescriptor("settle-locus", "Release a mutating tool's active work-locus claim after tool use."),
  actionDescriptor("settle-session-summary", "Record a settled session-summary handoff carrier."),
  actionDescriptor("statusline", "Read the compact dev.bare-cedar-fog.emsenn.net agent status line.", { output: "text/plain" }),
]);

function actionDescriptor(name, summary, { output = "application/json" } = {}) {
  return Object.freeze({
    name,
    href: `/${name}`,
    summary,
    description: summary,
    input: "application/json",
    output,
    term: `dev.bare-cedar-fog.emsenn.net.mash-action.${name}`,
    strategyTerm: `dev.bare-cedar-fog.emsenn.net.mash-strategy.${name}`,
    sessionTerm: `dev.bare-cedar-fog.emsenn.net.mash-session.${name}`,
  });
}

export async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

export function payloadFromText(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      return {};
    }
  }
  return trimmed === "" ? {} : { text };
}

export function stringField(payload, key) {
  const value = payload[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function hookEventName(payload) {
  return stringField(payload, "hook_event_name") ?? "HookEvent";
}

export function sessionId(payload) {
  return stringField(payload, "session_id") ?? stringField(payload, "session") ?? "unknown-session";
}

export function harnessName(payload) {
  return stringField(payload, "harness")
    ?? stringField(payload, "agent")
    ?? (process.env.CLAUDE_PROJECT_DIR === undefined ? "codex" : "claude");
}

export async function recordDevEvent(source, payload, extra = {}) {
  const at = new Date().toISOString();
  const session = sessionId(payload);
  const nonce = randomUUID();
  const eventId = `dev-agent-event:${hash([source, session, hookEventName(payload), at, nonce]).slice(0, 24)}`;
  const compactedPayload = compactPayload(payload);
  const event = {
    kind: "dev.bare-cedar-fog.emsenn.net.agent-event",
    at,
    id: eventId,
    source,
    cockpit: "dev.bare-cedar-fog.emsenn.net",
    harness: harnessName(payload),
    session,
    hookEventName: hookEventName(payload),
    activity: activityForDevEvent({
      id: eventId,
      at,
      source,
      session,
      harness: harnessName(payload),
      hookEventName: hookEventName(payload),
      payload: compactedPayload,
      extra,
    }),
    payload: compactedPayload,
    ...extra,
  };
  witnessDevEvent(event, { source });
  return event;
}

export async function recordActivityPubInboxDelivery(payload, activity) {
  if (!isActivity(activity)) return null;
  const at = new Date().toISOString();
  const session = sessionId(payload);
  const harness = harnessName(payload);
  const targetActor = stringField(payload, "actor") ?? activityActorIri(harness, session);
  const nonce = randomUUID();
  const eventId = `dev-agent-event:${hash(["activitypub-inbox", session, targetActor, activity.id ?? activity, at, nonce]).slice(0, 24)}`;
  const compactedPayload = compactPayload(payload);
  const event = {
    kind: "dev.bare-cedar-fog.emsenn.net.agent-event",
    at,
    id: eventId,
    source: MASH_PROFILE.inbox.inboxSource,
    cockpit: "dev.bare-cedar-fog.emsenn.net",
    harness,
    session,
    hookEventName: "ActivityPubInbox",
    activity,
    payload: compactedPayload,
    inboxDelivery: {
      kind: MASH_PROFILE.kinds.activityPubInboxDelivery,
      actor: activity.actor,
      targetActor,
      activity: activity.id ?? null,
      type: activity.type,
      object: activity.object,
      addressedTo: activityAddressedTo(activity),
    },
  };
  witnessDevEvent(event, { source: MASH_PROFILE.inbox.inboxSource });
  return event;
}

function witnessDevEvent(event, { source }) {
  witnessInvocation(ICK_ROOT, "root", {
    caller: {
      transport: "dev-runtime",
      service: "dev.bare-cedar-fog.emsenn.net",
      source,
    },
    verb: "record-dev-event",
    args: { source },
    value: event,
    at: event.at,
  });
}

function activityForDevEvent({ id, at, source, session, harness, hookEventName: hook, payload, extra = {} }) {
  return organizingTheatreActivityForEvent({
    id,
    at,
    source,
    session,
    harness,
    hookEventName: hook,
    payload,
    extra,
    objectExtra: {
      cwd: typeof payload?.cwd === "string" ? workspacePath(payload.cwd) : null,
      toolName: typeof payload?.tool_name === "string" ? payload.tool_name : null,
      focusPaths: pathCandidates(payload, workspacePath(payload?.cwd)).slice(0, 16),
      payloadKeys: payload !== null && typeof payload === "object" ? Object.keys(payload).slice(0, 24) : [],
    },
  }, MASH_SERVICE_CONFIG, MASH_PROFILE.eventActivity);
}

function activityActorIri(harness, session) {
  return organizingTheatreAgentActorId(MASH_SERVICE_CONFIG, String(harness || "agent"), String(session || "unknown-session"));
}

export async function recordWorkLocusClaim(payload = {}) {
  const action = claimAction(payload);
  const now = new Date();
  const paths = claimPaths(payload);
  if (paths.length === 0 && (action === "claim" || (stringField(payload, "claim_id") === null && stringField(payload, "claimId") === null))) {
    throw new TypeError("claim-locus requires path, paths, focus, locus, file, cwd, or claim_id");
  }
  const reason = stringField(payload, "reason") ?? stringField(payload, "summary") ?? null;
  const ttlMinutes = action === "claim" ? claimTtlMinutes(payload) : null;
  const expiresAt = ttlMinutes === null ? null : new Date(now.getTime() + ttlMinutes * 60_000).toISOString();
  const claimId = stringField(payload, "claim_id") ?? stringField(payload, "claimId") ?? claimIdFor(payload, paths);
  const claim = {
    kind: MASH_PROFILE.kinds.workLocusClaim,
    action,
    claimId,
    session: sessionId(payload),
    harness: harnessName(payload),
    paths,
    reason,
    at: now.toISOString(),
    expiresAt,
  };
  const capability = claimCapability(claim);
  const claimWithCapability = { ...claim, capability };
  const event = await recordDevEvent("dev.bare-cedar-fog.emsenn.net.claim-locus", payload, {
    locusClaim: claimWithCapability,
  });
  const eventLog = await readAgentEventLog(320);
  const activeClaims = [...organizingTheatreActiveWorkLocusClaims(eventLog, MASH_SERVICE_CONFIG, {
    ...MASH_WORK_LOCUS_OPTIONS,
    now,
  })];
  return {
    kind: MASH_PROFILE.kinds.workLocusClaimResult,
    event: event.id,
    claim: claimWithCapability,
    capability,
    conflicts: action === "claim" ? claimConflictsFor(claimWithCapability, activeClaims) : [],
    activeClaims: activeClaims.slice(0, 16),
  };
}

function claimCapability(claim) {
  const normalized = organizingTheatreWorkLocusClaimFrom(claim, MASH_WORK_LOCUS_OPTIONS);
  if (normalized === null) throw new TypeError("claimCapability requires a dev.bare-cedar-fog.emsenn.net work-locus claim");
  return organizingTheatreWorkLocusCapability(normalized, MASH_SERVICE_CONFIG, MASH_WORK_LOCUS_OPTIONS);
}

function claimCapabilityGrant(claim) {
  return organizingTheatreWorkLocusCapabilityGrant({
    claimId: String(claim?.claimId ?? "unknown-locus"),
    paths: Array.isArray(claim?.paths) ? claim.paths : [],
  });
}

function capabilitySignalForClaim(claim) {
  return {
    ...organizingTheatreWorkLocusCapabilitySignal(claim, MASH_SERVICE_CONFIG, MASH_WORK_LOCUS_OPTIONS),
    kind: MASH_PROFILE.kinds.activeWorkLocusCapability,
  };
}

function workLocusGovernanceReading(activeClaims, { session, harness, focusPaths = [] } = {}) {
  const generatedAt = new Date().toISOString();
  const claims = activeClaims
    .map((claim) => castingClaimForActiveWorkLocus(claim, { session, harness }))
    .filter((claim) => claim !== null);
  if (claims.length === 0) {
    return Object.freeze({
      kind: "dev.bare-cedar-fog.emsenn.net.work-locus-governance-reading",
      generatedAt,
      source: "organizing.casting.governWorkLocusClaims",
      activeClaims: activeClaims.length,
      governedClaims: 0,
      focusPaths: Object.freeze([...focusPaths]),
      governance: null,
      summary: Object.freeze({
        monotone: true,
        coordination: "coordination-free",
        contested: 0,
        assignments: 0,
      }),
      claim: "No active work-locus claims were eligible for casting governance.",
    });
  }
  try {
    const governance = governWorkLocusClaims(claims, {
      cluster: "dev.bare-cedar-fog.emsenn.net.work-locus",
    });
    return Object.freeze({
      kind: "dev.bare-cedar-fog.emsenn.net.work-locus-governance-reading",
      generatedAt,
      source: "organizing.casting.governWorkLocusClaims",
      activeClaims: activeClaims.length,
      governedClaims: claims.length,
      focusPaths: Object.freeze([...focusPaths]),
      governance,
      summary: Object.freeze({
        monotone: governance.monotone,
        coordination: governance.calm.coordination ?? (governance.monotone ? "coordination-free" : "consensus-required"),
        contested: typeof governance.calm.contested === "number" ? governance.calm.contested : Math.max(0, claims.length - governance.assignmentsByIndex.length),
        assignments: governance.assignmentsByIndex.length,
      }),
      claim: "Active MASH work-locus capabilities are read through organizing's CALM/Raft casting governance bridge.",
    });
  } catch (error) {
    return Object.freeze({
      kind: "dev.bare-cedar-fog.emsenn.net.work-locus-governance-reading",
      generatedAt,
      source: "organizing.casting.governWorkLocusClaims",
      activeClaims: activeClaims.length,
      governedClaims: claims.length,
      focusPaths: Object.freeze([...focusPaths]),
      governance: null,
      obstruction: error instanceof Error ? error.message : String(error),
      summary: Object.freeze({
        monotone: false,
        coordination: "obstructed",
        contested: activeClaims.length,
        assignments: 0,
      }),
      claim: "Casting governance could not be computed; preserve the obstruction as a cockpit reading.",
    });
  }
}

function castingClaimForActiveWorkLocus(claim, { session, harness } = {}) {
  const paths = Array.isArray(claim?.paths)
    ? claim.paths.filter((item) => typeof item === "string" && item.trim() !== "")
    : [];
  if (paths.length === 0) return null;
  const claimSession = String(claim?.session ?? session ?? "unknown-session");
  const claimHarness = String(claim?.harness ?? harness ?? "agent");
  const claimId = String(claim?.claimId ?? claim?.id ?? hash([claimSession, claimHarness, ...paths]));
  const scene = situation({
    id: `dev-mash:${hash([claimId, claimSession, claimHarness, ...paths])}`,
    scene: "contested-locus",
    subject: {
      claimId,
      session: claimSession,
      harness: claimHarness,
      capability: claim?.capability ?? null,
    },
    substrate: paths,
    requiresCapabilities: ["agent-interface"],
    requiresAuthorities: ["workspace-edit"],
    description: String(claim?.reason ?? "MASH work-locus capability"),
  });
  return claimWorkLocus({
    situation: scene,
    region: paths,
    office: "agent-interface",
    assignee: `${claimHarness}:${claimSession}`,
    capabilities: ["agent-interface", "workspace-edit"],
    officeAuthorities: ["workspace-read", "workspace-edit"],
    requiresCapabilities: ["agent-interface"],
    requiresAuthorities: ["workspace-edit"],
    duties: ["coordinate-with-active-claims"],
    title: `${claimId} work-locus capability`,
  });
}

function claimAction(payload) {
  const raw = (stringField(payload, "action") ?? stringField(payload, "claim_action") ?? "claim").toLowerCase();
  return raw === "release" || raw === "clear" || raw === "done" ? "release" : "claim";
}

function claimPaths(payload) {
  const cwd = workspacePath(stringField(payload, "cwd"));
  const values = [];
  for (const key of ["path", "focus", "locus", "file"]) {
    const value = stringField(payload, key);
    if (value !== null) values.push(value);
  }
  for (const key of ["paths", "focusPaths", "loci", "files"]) {
    const value = payload[key];
    if (Array.isArray(value)) values.push(...value.filter((item) => typeof item === "string"));
  }
  const normalized = values
    .map((item) => workspacePath(item, cwd))
    .filter((item) => item !== null);
  const inferred = pathCandidates(payload, cwd).filter((item) => item !== ".");
  const specificInferred = cwd === null || inferred.length <= 1 ? inferred : inferred.filter((item) => item !== cwd);
  normalized.push(...specificInferred);
  if (normalized.length === 0 && cwd !== null) normalized.push(cwd);
  const unique = [...new Set(normalized)].sort();
  return unique.length > 1 ? unique.filter((item) => item !== ".") : unique;
}

function capabilityFocusPaths(payload) {
  const cwd = workspacePath(stringField(payload, "cwd"));
  const values = [];
  for (const key of ["path", "focus", "locus", "file"]) {
    const value = stringField(payload, key);
    if (value !== null) values.push(value);
  }
  for (const key of ["paths", "focusPaths", "loci", "files"]) {
    const value = payload[key];
    if (Array.isArray(value)) values.push(...value.filter((item) => typeof item === "string"));
  }
  const normalized = values
    .map((item) => workspacePath(item, cwd))
    .filter((item) => item !== null && item !== ".");
  const inferred = pathCandidates(payload, cwd).filter((item) => item !== "." && item !== cwd);
  return [...new Set([...normalized, ...inferred])].sort();
}

function claimTtlMinutes(payload) {
  const raw = payload.ttl_minutes ?? payload.ttlMinutes ?? payload.minutes;
  const parsed = Number(raw ?? 120);
  if (!Number.isFinite(parsed)) return 120;
  return Math.min(24 * 60, Math.max(5, Math.trunc(parsed)));
}

function claimIdFor(payload, paths) {
  return `dev-locus-claim:${hash([
    sessionId(payload),
    harnessName(payload),
    paths,
    stringField(payload, "reason") ?? "",
  ]).slice(0, 16)}`;
}

export async function readAgentState() {
  const sessions = {};
  for (const event of await readIckAgentEventLog(Number(process.env.EMSENN_DEV_ICK_EVENT_SCAN_LIMIT ?? 480))) {
    mergeSessionState(sessions, {
      session: event.session,
      updatedAt: event.at,
      hooks: 1,
      harnesses: [event.harness],
      latest: event.id,
    });
  }
  const updatedAt = Object.values(sessions)
    .map((item) => item?.updatedAt)
    .filter((item) => typeof item === "string")
    .sort()
    .at(-1) ?? null;
  return { kind: "dev.bare-cedar-fog.emsenn.net.agent-sessions", updatedAt, sessions };
}

export async function agentMashSignal(payload = {}, options = {}) {
  const session = sessionId(payload);
  const harness = harnessName(payload);
  const eventLog = await readAgentEventLog(Number(options.eventScanLimit ?? 320));
  return agentMashSignalFromEventLog({ session, harness, eventLog, options });
}

function agentMashSignalFromEventLog({ session, harness, eventLog, options = {} }) {
  return projectMashAgentSignal({
    session,
    harness,
    events: eventLog,
    seedActors: organizingTheatreAgentActorsForEvents(eventLog, MASH_SERVICE_CONFIG),
  }, MASH_SERVICE_CONFIG, {
    ...MASH_WORK_LOCUS_OPTIONS,
    kind: MASH_PROFILE.kinds.agentMashSignal,
    activityPubKind: MASH_PROFILE.kinds.mashActivityPubSignal,
    capabilityKind: MASH_PROFILE.kinds.activeWorkLocusCapability,
    peerClaims: Number(options.peerClaims ?? 8),
    peerCapabilities: Number(options.peerCapabilities ?? 8),
    inbox: {
      ...MASH_PROFILE.inbox,
    },
  });
}

export async function readCapabilityField(payload = {}, options = {}) {
  const session = sessionId(payload);
  const harness = harnessName(payload);
  const limit = boundedInteger(options.limit ?? payload.limit, 16, { max: 128 });
  const eventLog = await readAgentEventLog(Number(options.eventScanLimit ?? payload.eventScanLimit ?? 320));
  const focusPaths = capabilityFocusPaths(payload);
  const activeClaims = [...organizingTheatreActiveWorkLocusClaims(eventLog, MASH_SERVICE_CONFIG, {
    ...MASH_WORK_LOCUS_OPTIONS,
    max: boundedInteger(options.activeClaimsMax ?? payload.activeClaimsMax, 128, { max: 512 }),
  })];
  const field = organizingTheatreCapabilityField({
    session,
    harness,
    events: eventLog,
    focusPaths,
    activeClaims,
    seedActors: organizingTheatreAgentActorsForEvents(eventLog, MASH_SERVICE_CONFIG),
  }, MASH_SERVICE_CONFIG, {
    ...MASH_WORK_LOCUS_OPTIONS,
    kind: MASH_PROFILE.kinds.capabilityField,
    activityPubKind: MASH_PROFILE.kinds.mashActivityPubSignal,
    capabilityKind: MASH_PROFILE.kinds.activeWorkLocusCapability,
    limit,
    nextInterfaces: [
      { bin: "claim-locus", href: "/claim-locus", purpose: "Claim or release a workspace ActivityPub capability." },
      { href: ICK_JUPYTER_INFOTILE_VIEW.notebookHref, purpose: "Open the ICK Jupyter InfoTile notebook over the canonical witness field." },
    ],
  });
  return Object.freeze({
    ...field,
    workLocusGovernance: workLocusGovernanceReading(activeClaims, { session, harness, focusPaths }),
  });
}

export async function readActivityPubOutbox(payload = {}, options = {}) {
  const session = sessionId(payload);
  const harness = harnessName(payload);
  const limit = boundedInteger(options.limit ?? payload.limit, 24, { max: 128 });
  const eventScanLimit = boundedInteger(options.eventScanLimit ?? payload.eventScanLimit, Math.max(320, limit), { max: 4096 });
  const actor = requestedActivityActor(payload, { harness, session });
  const eventLog = await readAgentEventLog(eventScanLimit);
  return organizingTheatreActivityPubOutboxResource({
    session,
    harness,
    events: eventLog,
    actor,
    admittedActionActivities: admittedMashActionActivities(),
    seedActors: organizingTheatreAgentActorsForEvents(eventLog, MASH_SERVICE_CONFIG),
  }, MASH_SERVICE_CONFIG, {
    ...MASH_PROFILE.activityPubOutbox,
    limit,
    nextInterfaces: [
      ...(actor === null ? [] : [{ href: actor, purpose: "Read this ActivityStreams Service actor document." }]),
      { bin: "read-capability-field", href: "/read-capability-field", purpose: "Read the OCap work-locus field derived from this ActivityPub trace." },
      { bin: "claim-locus", href: "/claim-locus", purpose: "Mint or revoke a workspace Capability as ActivityPub activity." },
      { href: ICK_JUPYTER_INFOTILE_VIEW.notebookHref, purpose: "Open the ICK Jupyter InfoTile notebook over the same witnessed ActivityPub trace." },
    ],
  });
}

export async function readActivityPubActor(payload = {}, options = {}) {
  const session = sessionId(payload);
  const harness = harnessName(payload);
  const eventScanLimit = boundedInteger(options.eventScanLimit ?? payload.eventScanLimit, 320, { max: 4096 });
  const actorId = requestedActivityActor(payload, { harness, session }) ?? activityActorIri(harness, session);
  const limit = boundedInteger(options.limit ?? payload.limit, 12, { max: 64 });
  const actorResourceOptions = {
    ...MASH_WORK_LOCUS_OPTIONS,
    kind: MASH_PROFILE.kinds.activityPubActor,
    capabilityKind: MASH_PROFILE.kinds.activeWorkLocusCapability,
    limit,
    inbox: {
      ...MASH_PROFILE.inbox,
    },
    outboxResourceOptions: {
      ...MASH_PROFILE.activityPubOutbox,
      limit,
    },
  };
  if (actorId === MASH_ACTOR_IRI) {
    const eventLog = await readAgentEventLog(eventScanLimit);
    return organizingTheatreActivityPubActorResource({
      session,
      harness,
      actorId,
      events: eventLog,
      admittedActionActivities: admittedMashActionActivities(),
      seedActors: organizingTheatreAgentActorsForEvents(eventLog, MASH_SERVICE_CONFIG),
    }, MASH_SERVICE_CONFIG, {
      ...actorResourceOptions,
      nextInterfaces: [
        { href: "/outbox", purpose: "Read the canonical dev.bare-cedar-fog.emsenn.net MASH ActivityStreams outbox." },
        { href: ICK_JUPYTER_INFOTILE_VIEW.notebookHref, purpose: "Open the ICK Jupyter InfoTile notebook over the active MASH witness field." },
      ],
    });
  }
  const parsed = parseActivityActorIri(actorId);
  const eventLog = await readAgentEventLog(eventScanLimit);
  const actorEvents = eventLog.filter((event) => event.activity?.actor === actorId);
  const lane = laneFromEvents(actorEvents, {
    ...payload,
    harness: parsed?.harness ?? harness,
    session_id: parsed?.session ?? session,
  });
  return organizingTheatreActivityPubActorResource({
    session,
    harness,
    actorId,
    events: eventLog,
    actorHarness: parsed?.harness ?? harness,
    actorSession: parsed?.session ?? session,
    lane,
    seedActors: organizingTheatreAgentActorsForEvents(eventLog, MASH_SERVICE_CONFIG),
  }, MASH_SERVICE_CONFIG, {
    ...actorResourceOptions,
    nextInterfaces: [
      { href: `${actorId.replace(/\/+$/u, "")}/outbox`, purpose: "Read this actor's ActivityStreams OrderedCollection outbox." },
      { href: `${actorId.replace(/\/+$/u, "")}/inbox`, purpose: "Read this actor's ActivityStreams OrderedCollection inbox." },
      { bin: "read-capability-field", href: "/read-capability-field", purpose: "Read active OCap workspace capabilities for this actor and peers." },
    ],
  });
}

function requestedActivityActor(payload, defaults) {
  const requestedActor = stringField(payload, "actor")
    ?? stringField(payload, "actor_id")
    ?? stringField(payload, "actorId");
  if (requestedActor !== null) return requestedActor;
  const requestedSession = stringField(payload, "session_filter") ?? stringField(payload, "sessionFilter");
  const requestedHarness = stringField(payload, "harness_filter") ?? stringField(payload, "harnessFilter");
  return requestedSession === null && requestedHarness === null
    ? null
    : activityActorIri(requestedHarness ?? defaults.harness, requestedSession ?? defaults.session);
}

export async function agentSessionHandoff(payload = {}, options = {}) {
  const session = sessionId(payload);
  const harness = harnessName(payload);
  const eventLog = await readAgentEventLog(Number(options.eventScanLimit ?? 320));
  const sessionEvents = eventLog.filter((event) => event.session === session);
  const recentEvents = sessionEvents.slice(-Number(options.events ?? 12)).map(eventDigest);
  const lane = laneFromEvents(sessionEvents, payload);
  const signal = await agentMashSignal(payload, { eventScanLimit: options.eventScanLimit ?? 320 });
  const latestGate = latestSessionGate(sessionEvents);
  const handoff = projectMashAgentSessionHandoff({
    session,
    harness,
    hookEventName: hookEventName(payload),
    lane,
    recentEvents,
    signal,
    latestGate,
  }, {
    kind: MASH_PROFILE.kinds.agentSessionHandoff,
    nextInterfaces: [
      { href: `/agents/${encodeURIComponent(harness)}/${encodeURIComponent(session)}`, purpose: "Read this session as an ActivityStreams Service actor." },
      { href: `/agents/${encodeURIComponent(harness)}/${encodeURIComponent(session)}/outbox`, purpose: "Read this session actor's ActivityStreams OrderedCollection outbox." },
      { href: "/outbox", purpose: "Read the MASH ActivityStreams OrderedCollection outbox directly." },
      { bin: "read-capability-field", href: "/read-capability-field", purpose: "Read the compact AP/OCap capability field before editing." },
      { bin: "claim-locus", href: "/claim-locus", purpose: "Release any active claims before handing off if the work is no longer in flight." },
      { bin: "orient-agent", href: "/orient-agent", purpose: "Regenerate a full orientation capsule after compaction or resume." },
    ],
  });
  return Object.freeze({
    ...handoff,
    workLocusGovernance: workLocusGovernanceReading(signal.activeClaims ?? [], {
      session,
      harness,
      focusPaths: Array.isArray(lane?.focusPaths) ? lane.focusPaths : [],
    }),
  });
}

export async function readAgentSessionHandoff(payload = {}, options = {}) {
  const session = sessionId(payload);
  const eventLog = await readAgentEventLog(Number(options.eventScanLimit ?? 480));
  const recorded = organizingTheatreLatestRecordedAgentSessionHandoff(eventLog, session, {
    handoffKind: MASH_PROFILE.kinds.agentSessionHandoff,
  });
  if (recorded !== null) {
    return organizingTheatreAgentSessionHandoffResource({ session, recorded }, {
      kind: MASH_PROFILE.kinds.agentSessionHandoffResource,
    });
  }
  return organizingTheatreAgentSessionHandoffResource({
    session,
    handoffCarrier: await agentSessionHandoff(payload, options),
  }, {
    kind: MASH_PROFILE.kinds.agentSessionHandoffResource,
  });
}

export async function agentOrientation(payload = {}, options = {}) {
  const session = sessionId(payload);
  const harness = harnessName(payload);
  const [state, hookSurface, mcpSurface, archiveBasis, eventLog, workSurface] = await Promise.all([
    readAgentState(),
    readHookSurface(),
    readMcpSurface(),
    archiveContextBasis(payload, options),
    readAgentEventLog(Number(options.eventScanLimit ?? 240)),
    readDevWorkSurface(),
  ]);
  const current = state.sessions?.[session] ?? null;
  const recentEvents = eventLog
    .filter((event) => event.session === session)
    .slice(-Number(options.events ?? 8))
    .map(eventDigest);
  const yourRawEvents = eventLog.filter((event) => event.session === session);
  const yourLane = laneFromEvents(yourRawEvents, payload);
  const peerSessions = Object.values(state.sessions ?? {})
    .filter((item) => item?.session !== session)
    .sort((left, right) => String(right?.updatedAt ?? "").localeCompare(String(left?.updatedAt ?? "")))
    .slice(0, Number(options.peers ?? 8))
    .map((item) => {
      const peerSession = String(item.session ?? "unknown-session");
      const lane = laneFromEvents(eventLog.filter((event) => event.session === peerSession), {});
      return {
        session: peerSession,
        updatedAt: item.updatedAt ?? null,
        hooks: Number(item.hooks ?? 0),
        harnesses: Array.isArray(item.harnesses) ? item.harnesses : [],
        latest: item.latest ?? null,
        lane,
      };
    });
  const peerEvents = eventLog
    .filter((event) => event.session !== session)
    .slice(-Number(options.peerEvents ?? 8))
    .map(eventDigest);
  const collisionAwareness = collisionAwarenessFor(yourLane, peerSessions);
  const terms = promptTerms(payload);
  const yourWork = workFocusFor(yourLane, workSurface.endeavor, terms);
  const workTheoryTerms = terms.length === 0 ? defaultWorkTheoryTerms(workSurface.endeavor) : terms;
  const yourWorkTheory = workTheoryFor(workSurface.workVocabulary, workTheoryTerms, yourLane.focusPaths ?? []);
  const contextSurfaces = contextSurfaceTemplatesFor({ session, harness, hook: hookEventName(payload), lane: yourLane });
  const generatedAt = new Date().toISOString();
  const mashContext = modeledAgentSemioticHubFor({
    generatedAt,
    session,
    harness,
    hook: hookEventName(payload),
    current,
    yourLane,
    peerSessions,
    peerEvents,
    collisionAwareness,
    state,
    eventLog,
    hookSurface,
    mcpSurface,
    workSurface,
  });
  const mashSignal = agentMashSignalFromEventLog({ session, harness, eventLog, options });
  const roughEdges = [
    ...mcpSurface.filter((item) => !item.present).map((item) => `${item.path} missing`),
    workSurface.freshness.stale ? `dev work surface build is stale: newest source ${workSurface.freshness.newestSourceMtime} > oldest build ${workSurface.freshness.oldestBuildMtime}` : null,
    hookSurface.codex === null ? ".codex/hooks.json unreadable" : null,
    hookSurface.claude === null ? ".claude/settings.json unreadable" : null,
    current === null ? "no dev.bare-cedar-fog.emsenn.net session state yet; confirm ingest-hook is receiving this harness session id" : null,
  ].filter(Boolean);
  const infotileField = infotileFieldFor({
    generatedAt,
    session,
    harness,
    hook: hookEventName(payload),
    yourLane,
    peerSessions,
    collisionAwareness,
    archiveBasis,
    workFocus: yourWork,
    workTheory: yourWorkTheory,
    workSurface,
    mashContext,
    mashSignal,
    roughEdges,
    terms,
  });
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.agent-orientation",
    generatedAt,
    cockpit: "dev.bare-cedar-fog.emsenn.net",
    session,
    harness,
    hookEventName: hookEventName(payload),
    promptTerms: terms,
    workTheoryTerms,
    scope: "agent-session",
    yourContext: {
      kind: "dev.bare-cedar-fog.emsenn.net.your-agent-context",
      session,
      harness,
      hookEventName: hookEventName(payload),
      promptTerms: terms,
      workTheoryTerms,
      sessionState: current,
      recentEvents,
      lane: yourLane,
      workFocus: yourWork,
      workTheory: yourWorkTheory,
      ownership: {
        claim: "This section is scoped to the requesting harness session.",
        notYours: "Peer sessions and shared surfaces are context, not assignment.",
      },
      contextSurfaces: contextSurfaces.filter((surface) => surface.scope === "your-agent"),
    },
    sharedContext: {
      kind: "dev.bare-cedar-fog.emsenn.net.shared-agent-context",
      hookSurface,
      mcpSurface,
      archiveBasis,
      mashContext,
      mashSignal,
      infotileField,
      informationCoherenceKernel: ICK_SERVICE_FACE,
      workSurface,
      claim: "Shared workspace and swarm background that must be filtered through yourContext before action.",
      contextSurfaces: contextSurfaces.filter((surface) => surface.scope === "shared"),
    },
    endeavorContext: {
      kind: "dev.bare-cedar-fog.emsenn.net.endeavor-context",
      operation: workSurface.endeavor?.operation ?? null,
      summary: workSurface.endeavor?.summary ?? null,
      activeCarriers: activeCarriers(workSurface.endeavor),
      heldOpinions: heldOpinions(workSurface.opinions),
      claim: "The current dev-local endeavor projection is a managed operation reading, not an ops.561.group-owned task dump.",
    },
    peerContext: {
      kind: "dev.bare-cedar-fog.emsenn.net.peer-agent-context",
      sessions: peerSessions,
      recentEvents: peerEvents,
      collisionAwareness,
      claim: "Other agents may be active; treat this as collision awareness, not your task list.",
    },
    mashContext,
    mashSignal,
    infotileField,
    sessionState: current,
    recentEvents,
    hookSurface,
    mcpSurface,
    archiveBasis,
    roughEdges,
    contextSurfaces,
    nextInterfaces: [
      {
        bin: "orient-agent",
        purpose: "Read this richer context dossier through the Relating-mounted dev.bare-cedar-fog.emsenn.net MASH action surface.",
        href: "/orient-agent",
      },
      {
        purpose: "Open the ICK Jupyter InfoTile notebook over the same canonical witness rows.",
        href: ICK_JUPYTER_INFOTILE_VIEW.notebookHref,
      },
      {
        bin: "read-capability-field",
        purpose: "Read active ActivityPub/OCap workspace capabilities, peer holders, and relevant conflicts before mutating files.",
        href: "/read-capability-field",
      },
      {
        bin: "organize-kernel",
        purpose: "Read the ICK service face before adding model runtime work; attach NVIDIA, local NPU, or other frontier runtimes as actuators behind this boundary.",
        href: ICK_SERVICE_FACE.discoveryHref,
      },
      {
        purpose: "Read this harness session as an ActivityStreams Service actor with inbox, outbox, and active capabilities.",
        href: `/agents/${encodeURIComponent(harness)}/${encodeURIComponent(session)}`,
      },
      {
        purpose: "Read this harness session's ActivityStreams inbox; delivered Activities are folded through animating perceiveInbox in the MASH signal.",
        href: `/agents/${encodeURIComponent(harness)}/${encodeURIComponent(session)}/inbox`,
      },
      {
        purpose: "Read the ActivityStreams OrderedCollection outbox and organizing federation reading directly.",
        href: `/agents/${encodeURIComponent(harness)}/${encodeURIComponent(session)}/outbox`,
      },
      {
        bin: "read-session-handoff",
        purpose: "Recover the latest structured MASH handoff for this session.",
        href: "/read-session-handoff",
      },
      {
        bin: "inject-cockpit",
        purpose: "Inject compact cockpit context into Codex or Claude prompt state.",
        href: "/inject-cockpit",
      },
      {
        bin: "settle-session-summary",
        purpose: "Fold session activity into a handoff-friendly event.",
        href: "/settle-session-summary",
      },
    ],
  };
}

export async function readAgentContextSurface(payload = {}) {
  const reference = stringField(payload, "href")
    ?? stringField(payload, "url")
    ?? `/agent/${encodeURIComponent(harnessName(payload))}/${encodeURIComponent(sessionId(payload))}.html`;
  const parsed = parseContextSurfaceHref(reference);
  const query = contextSurfaceQuery(parsed);
  const queryPrompt = [query.q, query.focus].filter(Boolean).join("\n");
  const prompt = [stringField(payload, "prompt"), queryPrompt].filter(Boolean).join("\n");
  const basePayload = {
    ...payload,
    harness: parsed.harness ?? harnessName(payload),
    session_id: parsed.session ?? sessionId(payload),
    ...(prompt === "" ? {} : { prompt }),
    ...(query.cwd === null ? {} : { cwd: query.cwd }),
  };
  const defaultLimit = boundedInteger(payload.limit, 8);
  const resourceLimit = query.limit ?? defaultLimit;
  if (parsed.aspect === "handoff") {
    const handoff = await readAgentSessionHandoff(basePayload, {
      eventScanLimit: query.scanLimit ?? boundedInteger(payload.eventScanLimit ?? payload.scanLimit, 480, { max: 4096 }),
      events: resourceLimit,
    });
    return {
      kind: "dev.bare-cedar-fog.emsenn.net.context-surface",
      href: parsed.href,
      generatedAt: new Date().toISOString(),
      templateId: parsed.templateId,
      scope: parsed.scope,
      audience: "assistant",
      mediaType: "text/html",
      mimeType: "application/json",
      body: {
        ...handoff,
        query: contextSurfaceQueryProjection(query),
      },
    };
  }
  const orientation = await agentOrientation(basePayload, {
    archiveLimit: parsed.aspect === "archive" ? resourceLimit : boundedInteger(payload.archiveLimit ?? payload.limit, 8),
    archiveScanLimit: query.scanLimit ?? boundedInteger(payload.archiveScanLimit ?? 0, 0),
    peers: parsed.aspect === "peers" ? resourceLimit : boundedInteger(payload.peers ?? payload.limit, 8),
    peerEvents: parsed.aspect === "peers" ? resourceLimit : boundedInteger(payload.peerEvents ?? payload.limit, 8),
  });
  const body = contextSurfaceBody(parsed, orientation, query);
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.context-surface",
    href: parsed.href,
    generatedAt: new Date().toISOString(),
    templateId: parsed.templateId,
    scope: parsed.scope,
    audience: "assistant",
    mediaType: "text/html",
    mimeType: "application/json",
    body,
  };
}

export async function readInfotileField(payload = {}, options = {}) {
  const orientation = await agentOrientation(payload, options);
  return orientation.infotileField;
}

function contextSurfaceQuery(resource) {
  return {
    q: queryText(resource.searchParams, "q"),
    focus: queryText(resource.searchParams, "focus"),
    cwd: queryText(resource.searchParams, "cwd"),
    limit: queryInteger(resource.searchParams, "limit"),
    scanLimit: queryInteger(resource.searchParams, "scanLimit") ?? queryInteger(resource.searchParams, "scan-limit"),
  };
}

function queryText(params, key) {
  const value = params?.get(key);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function queryInteger(params, key) {
  return boundedInteger(queryText(params, key), null);
}

function boundedInteger(value, fallback, { min = 0, max = 64 } = {}) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function orientationDigest(orientation) {
  const lines = [];
  const yours = orientation.yourContext ?? orientation;
  const shared = orientation.sharedContext ?? orientation;
  const peers = orientation.peerContext ?? { sessions: [], recentEvents: [] };
  const endeavor = orientation.endeavorContext ?? {};
  const flow = endeavor.summary === undefined || endeavor.summary === null
    ? "unknown"
    : `${endeavor.summary.notStarted}/${endeavor.summary.inProgress}/${endeavor.summary.done}`;
  lines.push(`- your orientation: ${yours.session} via ${yours.harness}; your events ${yours.recentEvents.length}; peer sessions ${peers.sessions.length}; shared archive refs ${shared.archiveBasis.length}; endeavor flow ${flow}`);
  lines.push("- ownership: peer sessions and shared archive/context are awareness, not assignment.");
  if (yours.lane !== undefined) {
    lines.push(`- your lane: cwd ${yours.lane.currentCwd ?? "unknown"}; tools ${joinCounts(yours.lane.toolCounts)}; focus ${yours.lane.focusPaths.slice(0, 4).join(", ") || "unresolved"}`);
  }
  for (const item of (yours.workFocus ?? []).slice(0, 3)) lines.push(`- your work focus: ${item.id} ${item.status} (${item.reason})`);
  for (const item of (yours.workTheory ?? []).slice(0, 6)) lines.push(`- your work vocabulary: ${item.key} (${item.reason})`);
  for (const item of (endeavor.activeCarriers ?? []).slice(0, 3)) lines.push(`- active endeavor: ${item.id} ${item.status} ${item.title}`);
  for (const item of (endeavor.heldOpinions ?? []).slice(0, 2)) lines.push(`- opinion: ${item.id} ${item.claim}`);
  for (const item of (orientation.contextSurfaces ?? []).slice(0, 4)) lines.push(`- context surface: ${item.hrefTemplate} (${item.scope}; ${item.priority}) ${item.purpose}`);
  if (orientation.mashContext !== undefined) {
    const claims = orientation.mashContext.workField?.activeClaims ?? [];
    const conflicts = orientation.mashContext.workField?.claimConflicts ?? [];
    const activityPub = orientation.mashContext.activityPub ?? null;
    const federation = activityPub?.federation ?? null;
    const reading = federation?.reading ?? null;
    const inbox = orientation.mashSignal?.activityPub?.observer?.inbox ?? null;
    const inboxAgent = inbox?.agent ?? null;
    lines.push(`- MASH manifold: ${orientation.mashContext.spacetime.sessionCount} sessions, ${orientation.mashContext.spacetime.eventWindow} events, ${orientation.mashContext.relations.length} relations, ${claims.length} active claims, ${conflicts.length} claim conflicts`);
    if (activityPub !== null) lines.push(`- MASH ActivityPub: ${activityPub.outbox?.totalItems ?? 0} outbox activities; ${federation?.camps?.length ?? 0} camps; ${reading === null || reading === undefined ? "no federation reading" : `${reading.coordination}, federationOnly ${reading.federationOnly}`}`);
    if (inbox !== null) lines.push(`- AP inbox perception: ${inbox.activities} delivered activities folded through perceiveInbox; ${inboxAgent === null ? "no perceived agent yet" : `loop ${inboxAgent.loop}, held ${inboxAgent.perception?.held ?? 0}, contested ${inboxAgent.perception?.contested ?? 0}, stance ${inboxAgent.stance?.lean ?? "unknown"}, cognition ${inboxAgent.cognition?.regime ?? "unknown"}`}`);
    for (const item of claims.filter((claim) => claim.session === orientation.session).slice(0, 3)) {
      const capability = item.capability ?? claimCapability(item);
      lines.push(`- your active capability: ${capability.grants} held by ${capability.holder} until ${item.expiresAt ?? "unknown"} (${item.reason ?? "no reason"})`);
    }
    for (const item of conflicts.filter((conflict) => conflict.left.session === orientation.session || conflict.right.session === orientation.session).slice(0, 3)) lines.push(`- capability conflict: ${item.path} ${item.left.session} <-> ${item.right.session} (${item.severity}; ${item.left.capability ?? "no-left-cap"} / ${item.right.capability ?? "no-right-cap"})`);
  }
  const hooks = orientation.hookSurface.codex?.events ?? [];
  if (hooks.length > 0) lines.push(`- codex hooks: ${hooks.map((item) => `${item.event}:${item.count}`).join(", ")}`);
  const mcp = shared.mcpSurface.map((item) => `${item.path}:${item.present ? "present" : "missing"}`).join(", ");
  if (mcp !== "") lines.push(`- MCP configs: ${mcp}`);
  for (const item of shared.archiveBasis.slice(0, 4)) lines.push(`- archive: ${item.path} (${item.score}) ${item.claim}`);
  for (const item of peers.sessions.slice(0, 3)) lines.push(`- peer: ${item.session} via ${item.harnesses.join(",") || "agent"} cwd ${item.lane?.currentCwd ?? "unknown"} updated ${item.updatedAt ?? "unknown"}`);
  for (const item of (peers.collisionAwareness ?? []).slice(0, 3)) lines.push(`- collision: ${item.path} also seen in ${item.peerSession} (${item.reason})`);
  if (orientation.roughEdges.length > 0) lines.push(`- rough edges: ${orientation.roughEdges.slice(0, 4).join("; ")}`);
  return lines.join("\n");
}

function contextSurfaceTemplatesFor({ session, harness, hook, lane }) {
  void session;
  void harness;
  void hook;
  void lane;
  return [];
}

function contextSurfaceTemplate({ id, hrefTemplate, title, scope, priority, purpose, params, morphism }) {
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.context-surface-template",
    id,
    hrefTemplate,
    mediaType: "text/html",
    title,
    scope,
    priority,
    audience: "assistant",
    mimeType: "application/json",
    alternateMimeTypes: ["application/json"],
    purpose,
    params,
    morphism,
  };
}

function contextSurfaceMorphism(outputCarrier, body) {
  return {
    bodyFormat: "rmn-core-0.1",
    inputCarrier: "dev.bare-cedar-fog.emsenn.net.agent-orientation",
    outputCarrier,
    body: ["lam", body],
  };
}

function parseContextSurfaceHref(href) {
  let parsed;
  try {
    parsed = new URL(href, "https://dev.bare-cedar-fog.emsenn.net");
  } catch {
    throw new TypeError(`invalid context surface href: ${href}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new TypeError(`unsupported context surface href: ${href}`);
  }
  const segments = parsed.pathname.split("/").filter((segment) => segment !== "").map((segment) => decodeURIComponent(segment));
  if (segments[0] === "mash" && segments[1] === "manifold.html") {
    return {
      templateId: "dev.mash.manifold",
      scope: "shared",
      aspect: "mash",
      searchParams: parsed.searchParams,
      href: contextHrefFromParsed({ aspect: "mash", searchParams: parsed.searchParams }),
    };
  }
  if (segments[0] === "swarm" && segments[1] === "peers.html") {
    return {
      templateId: "dev.swarm.peers",
      scope: "shared",
      aspect: "peers",
      searchParams: parsed.searchParams,
      href: contextHrefFromParsed({ aspect: "peers", searchParams: parsed.searchParams }),
    };
  }
  if (segments[0] !== "agent") throw new TypeError(`unsupported context surface href: ${href}`);
  const harness = segments[1] ?? null;
  const rawSession = segments[2] ?? null;
  if (harness === null || rawSession === null) throw new TypeError(`context surface href needs harness and session: ${href}`);
  if (rawSession.endsWith(".html")) {
    const session = rawSession.slice(0, -".html".length);
    if (session === "") throw new TypeError(`context surface href needs session before .html: ${href}`);
    return {
      templateId: "dev.agent.session",
      scope: "your-agent",
      harness,
      session,
      aspect: "session",
      searchParams: parsed.searchParams,
      href: contextHrefFromParsed({ harness, session, aspect: "session", searchParams: parsed.searchParams }),
    };
  }
  const aspectFile = segments[3] ?? null;
  if (aspectFile !== "work.html" && aspectFile !== "archive.html" && aspectFile !== "handoff.html") {
    throw new TypeError(`context surface href must end in .html for session, work, archive, handoff, or peers: ${href}`);
  }
  const aspect = aspectFile.slice(0, -".html".length);
  return {
    templateId: aspect === "work" ? "dev.agent.work" : aspect === "archive" ? "dev.agent.archive" : "dev.agent.handoff",
    scope: "your-agent",
    harness,
    session: rawSession,
    aspect,
    searchParams: parsed.searchParams,
    href: contextHrefFromParsed({ harness, session: rawSession, aspect, searchParams: parsed.searchParams }),
  };
}

function contextHrefFromParsed(resource) {
  const search = resource.searchParams?.toString();
  const suffix = search === undefined || search === "" ? "" : `?${search}`;
  if (resource.aspect === "mash") return `/mash/manifold.html${suffix}`;
  if (resource.aspect === "peers") return `/swarm/peers.html${suffix}`;
  const encodedHarness = encodeURIComponent(resource.harness);
  const encodedSession = encodeURIComponent(resource.session);
  if (resource.aspect === "work" || resource.aspect === "archive" || resource.aspect === "handoff") {
    return `/agent/${encodedHarness}/${encodedSession}/${encodeURIComponent(resource.aspect)}.html${suffix}`;
  }
  return `/agent/${encodedHarness}/${encodedSession}.html${suffix}`;
}

function contextSurfaceBody(resource, orientation, query) {
  const queryProjection = contextSurfaceQueryProjection(query);
  if (resource.aspect === "mash") {
    const activityPub = orientation.mashContext.activityPub === undefined
      ? undefined
      : {
          ...orientation.mashContext.activityPub,
          outbox: {
            ...orientation.mashContext.activityPub.outbox,
            orderedItems: maybeLimit(orientation.mashContext.activityPub.outbox?.orderedItems, query.limit),
            totalItems: maybeLimit(orientation.mashContext.activityPub.outbox?.orderedItems, query.limit)?.length
              ?? orientation.mashContext.activityPub.outbox?.totalItems
              ?? 0,
          },
          federation: {
            ...orientation.mashContext.activityPub.federation,
            deliveries: maybeLimit(orientation.mashContext.activityPub.federation?.deliveries, query.limit),
          },
        };
    return {
      ...orientation.mashContext,
      query: queryProjection,
      ...(activityPub === undefined ? {} : { activityPub }),
      loci: maybeLimit(orientation.mashContext.loci, query.limit),
      relations: maybeLimit(orientation.mashContext.relations, query.limit),
      recentEvents: maybeLimit([
        ...orientation.recentEvents,
        ...orientation.peerContext.recentEvents,
      ], query.limit),
    };
  }
  if (resource.aspect === "peers") {
    return {
      ...orientation.peerContext,
      query: queryProjection,
      sessions: maybeLimit(orientation.peerContext.sessions, query.limit),
      recentEvents: maybeLimit(orientation.peerContext.recentEvents, query.limit),
      collisionAwareness: maybeLimit(orientation.peerContext.collisionAwareness, query.limit),
    };
  }
  if (resource.aspect === "work") {
    return {
      kind: "dev.bare-cedar-fog.emsenn.net.agent-work-context",
      session: orientation.session,
      harness: orientation.harness,
      query: queryProjection,
      workFocus: maybeLimit(orientation.yourContext.workFocus, query.limit),
      workTheory: maybeLimit(orientation.yourContext.workTheory, query.limit),
      endeavor: {
        ...orientation.endeavorContext,
        activeCarriers: maybeLimit(orientation.endeavorContext.activeCarriers, query.limit),
      },
      nextInterfaces: orientation.nextInterfaces,
      contextSurfaces: orientation.yourContext.contextSurfaces,
    };
  }
  if (resource.aspect === "archive") {
    return {
      kind: "dev.bare-cedar-fog.emsenn.net.agent-archive-context",
      session: orientation.session,
      harness: orientation.harness,
      query: queryProjection,
      promptTerms: orientation.promptTerms,
      workTheoryTerms: orientation.workTheoryTerms,
      archiveBasis: orientation.archiveBasis,
      contextSurfaces: orientation.yourContext.contextSurfaces,
    };
  }
  return {
    ...orientation.yourContext,
    query: queryProjection,
  };
}

function contextSurfaceQueryProjection(query) {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== null));
}

function maybeLimit(items, limit) {
  return limit === null || !Array.isArray(items) ? items : items.slice(0, limit);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function readDevWorkVocabulary() {
  const surface = await readDevWorkSurface();
  return surface.workVocabulary ?? {
    kind: "dev.bare-cedar-fog.emsenn.net.work-vocabulary",
    concepts: [],
    references: [],
  };
}

async function readDevWorkSurface() {
  const buildRoot = BUILD_ROOT();
  const [endeavor, opinions, workVocabulary] = await Promise.all([
    readJson(path.join(buildRoot, "api", "endeavor-enactment.json"), null),
    readJson(path.join(buildRoot, "api", "opinions.json"), null),
    readJson(path.join(buildRoot, "api", "work-vocabulary.json"), null),
  ]);
  const freshness = await devWorkSurfaceFreshness([
    path.join(buildRoot, "api", "endeavor-enactment.json"),
    path.join(buildRoot, "api", "opinions.json"),
    path.join(buildRoot, "api", "work-vocabulary.json"),
  ], [
    path.join(SITE_ROOT, "src", "index.mts"),
    path.join(SITE_ROOT, "package.json"),
    path.join(REPO_ROOT, "lib", "managing-operations", "src", "governing", "opinion.mts"),
    path.join(REPO_ROOT, "lib", "managing-operations", "src", "structuring", "work-vocabulary.mts"),
  ]);
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.work-surface",
    endeavor,
    opinions,
    workVocabulary: workVocabulary ?? endeavor?.workVocabulary ?? null,
    freshness,
    source: "sites/dev.bare-cedar-fog.emsenn.net/build/api",
  };
}

function BUILD_ROOT() {
  return path.join(SITE_ROOT, "build");
}

async function devWorkSurfaceFreshness(buildFiles, sourceFiles) {
  const [buildStats, sourceStats] = await Promise.all([
    Promise.all(buildFiles.map(fileMtime)),
    Promise.all(sourceFiles.map(fileMtime)),
  ]);
  const buildTimes = buildStats.filter((item) => item !== null).map((item) => item.mtimeMs);
  const sourceTimes = sourceStats.filter((item) => item !== null).map((item) => item.mtimeMs);
  const oldestBuild = buildTimes.length === 0 ? null : Math.min(...buildTimes);
  const newestSource = sourceTimes.length === 0 ? null : Math.max(...sourceTimes);
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.work-surface-freshness",
    stale: oldestBuild === null || newestSource === null ? true : newestSource > oldestBuild,
    oldestBuildMtime: oldestBuild === null ? null : new Date(oldestBuild).toISOString(),
    newestSourceMtime: newestSource === null ? null : new Date(newestSource).toISOString(),
    buildFiles: buildStats,
    sourceFiles: sourceStats,
  };
}

async function fileMtime(file) {
  try {
    const info = await stat(file);
    return {
      path: path.relative(REPO_ROOT, file).replaceAll("\\", "/"),
      mtimeMs: info.mtimeMs,
      mtime: info.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

function workFocusFor(lane, endeavor, extraTerms = []) {
  if (endeavor === null || endeavor === undefined || !Array.isArray(endeavor.carriers)) return [];
  const stopTerms = new Set(["dev", "net", "emsenn", "group", "sites", "content", "agent", "work", "focus"]);
  const focus = new Set(lane.focusPaths ?? []);
  const terms = new Set();
  for (const term of extraTerms) {
    addSearchTerms(terms, term, stopTerms);
  }
  for (const item of focus) {
    for (const part of String(item).split(/[\\/._-]+/u)) {
      addSearchTerms(terms, part, stopTerms);
    }
  }
  const matches = [];
  for (const carrier of endeavor.carriers) {
    const haystack = [
      carrier.id,
      carrier.title,
      carrier.summary,
      ...(Array.isArray(carrier.evidence) ? carrier.evidence : []),
    ].join(" ").toLowerCase();
    const matched = [...terms].filter((term) => haystack.includes(term));
    if (matched.length === 0) continue;
    matches.push({
      id: carrier.id,
      title: carrier.title,
      status: carrier.status,
      reason: `matched ${matched.slice(0, 4).join(", ")}`,
      evidence: matched,
    });
  }
  return matches.sort((left, right) => right.evidence.length - left.evidence.length || left.id.localeCompare(right.id)).slice(0, 8);
}

function workTheoryFor(vocabulary, extraTerms = [], focusPaths = []) {
  if (vocabulary === null || vocabulary === undefined || !Array.isArray(vocabulary.concepts)) return [];
  const stopTerms = new Set(["dev", "net", "emsenn", "group", "sites", "content", "agent", "work", "focus"]);
  const terms = new Set();
  for (const term of extraTerms) addSearchTerms(terms, term, stopTerms);
  for (const item of focusPaths) {
    for (const part of String(item).split(/[\\/._-]+/u)) addSearchTerms(terms, part, stopTerms);
  }
  const orderedTerms = [...terms];
  const matches = [];
  for (const concept of vocabulary.concepts) {
    const haystack = [
      concept.key,
      concept.summary,
      concept.generatedBy ?? "",
      ...(Array.isArray(concept.distinguishesFrom) ? concept.distinguishesFrom : []),
      ...(Array.isArray(concept.references) ? concept.references.map((reference) => `${reference.id} ${reference.path} ${reference.claim}`) : []),
    ].join(" ").toLowerCase();
    const matched = [...terms].filter((term) => haystack.includes(term));
    if (matched.length === 0) continue;
    matches.push({
      key: concept.key,
      summary: concept.summary,
      generatedBy: concept.generatedBy ?? null,
      distinguishesFrom: concept.distinguishesFrom ?? [],
      references: concept.references ?? [],
      reason: `matched ${matched.slice(0, 4).join(", ")}`,
      evidence: matched,
      exactTermIndex: orderedTerms.indexOf(String(concept.key)),
    });
  }
  return matches
    .sort((left, right) => {
      const leftExact = left.exactTermIndex >= 0 ? left.exactTermIndex : Number.POSITIVE_INFINITY;
      const rightExact = right.exactTermIndex >= 0 ? right.exactTermIndex : Number.POSITIVE_INFINITY;
      return leftExact - rightExact || right.evidence.length - left.evidence.length || left.key.localeCompare(right.key);
    })
    .slice(0, 12)
    .map(({ exactTermIndex: _exactTermIndex, ...item }) => item);
}

function defaultWorkTheoryTerms(endeavor) {
  const terms = new Set([
    "task",
    "workflow",
    "work-item",
    "work-unit",
    "lifecycle",
    "shared-field",
    "coordination",
    "trace",
    "governance",
    "common-knowledge",
    "swarm-protocol",
    "goal",
    "objective",
    "milestone",
    "plan",
    "project",
    "campaign",
    "endeavor",
  ]);
  if (endeavor !== null && endeavor !== undefined && Array.isArray(endeavor.carriers)) {
    for (const carrier of endeavor.carriers) {
      if (carrier.status === "done" || carrier.status === "complete") continue;
      for (const value of [
        carrier.id,
        carrier.title,
        carrier.summary,
        ...(Array.isArray(carrier.evidence) ? carrier.evidence : []),
      ]) {
        addSearchTerms(terms, value, new Set(["dev", "net", "emsenn", "group", "sites", "content", "agent", "work", "focus"]));
      }
    }
  }
  return [...terms].slice(0, 32);
}

function addSearchTerms(terms, value, stopTerms) {
  const normalized = String(value).toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  if (normalized.length >= 4 && !stopTerms.has(normalized)) {
    terms.add(normalized);
    if (normalized.endsWith("s") && normalized.length >= 5) terms.add(normalized.slice(0, -1));
  }
  for (const part of normalized.split(/[^a-z0-9]+/u)) {
    if (part.length >= 4 && !stopTerms.has(part)) {
      terms.add(part);
      if (part.endsWith("s") && part.length >= 5) terms.add(part.slice(0, -1));
    }
  }
}

function activeCarriers(endeavor) {
  if (endeavor === null || endeavor === undefined || !Array.isArray(endeavor.carriers)) return [];
  return endeavor.carriers
    .filter((carrier) => carrier.status !== "done" && carrier.status !== "complete")
    .map((carrier) => ({
      id: carrier.id,
      title: carrier.title,
      status: carrier.status,
      summary: carrier.summary,
    }))
    .slice(0, 8);
}

function heldOpinions(opinions) {
  if (opinions === null || opinions === undefined || !Array.isArray(opinions.opinions)) return [];
  return opinions.opinions
    .filter((opinion) => opinion.status === "held")
    .map((opinion) => ({
      id: opinion.id,
      claim: opinion.claim,
      scopes: opinion.scopes,
      severity: opinion.severity,
    }))
    .slice(0, 8);
}

function infotileFieldFor({
  generatedAt,
  session,
  harness,
  hook,
  yourLane,
  peerSessions,
  collisionAwareness,
  archiveBasis,
  workFocus,
  workTheory,
  workSurface,
  mashContext,
  mashSignal,
  roughEdges,
  terms,
}) {
  const activeClaims = Array.isArray(mashContext.workField?.activeClaims) ? mashContext.workField.activeClaims : [];
  const claimConflicts = Array.isArray(mashContext.workField?.claimConflicts) ? mashContext.workField.claimConflicts : [];
  const loci = Array.isArray(mashContext.loci) ? mashContext.loci : [];
  const relations = Array.isArray(mashContext.relations) ? mashContext.relations : [];
  const tiles = [
    infotile({
      id: "tile:observer-session",
      title: "Observer Session",
      role: "agent-cone-apex",
      charge: chargeFor({ positive: true, negative: roughEdges.length > 0, reason: roughEdges.length > 0 ? "session has rough-edge readings" : "session is observable" }),
      evidence: [
        `session:${session}`,
        `harness:${harness}`,
        `hook:${hook}`,
        ...(yourLane.currentCwd === null || yourLane.currentCwd === undefined ? [] : [`cwd:${yourLane.currentCwd}`]),
      ],
      reading: "This agent session is the cone apex for the current InfoTile field.",
      loci: loci.slice(0, 1),
    }),
    infotile({
      id: "tile:ick-boundary",
      title: "Information Coherence Kernel",
      role: "served-nine-faculty-face",
      charge: chargeFor({ positive: true, negative: false, reason: "ICK service face is mounted in orientation" }),
      evidence: [ICK_SERVICE_FACE.packageName, ICK_SERVICE_FACE.discoveryHref, ICK_SERVICE_FACE.openApiHref],
      reading: "The nine-faculty kernel is read as one stable service face; model runtimes should enter as external actuators behind it.",
      loci: [ICK_SERVICE_FACE],
    }),
    infotile({
      id: "tile:mash-theatre",
      title: "MASH Organizing Theatre",
      role: "agent-session-substrate-reading",
      charge: chargeFor({ positive: loci.length > 0 || relations.length > 0, negative: claimConflicts.length > 0, reason: claimConflicts.length > 0 ? "active claim conflicts are held as information" : "agent theatre has visible loci/relations" }),
      evidence: [`loci:${loci.length}`, `relations:${relations.length}`, `activeClaims:${activeClaims.length}`, `claimConflicts:${claimConflicts.length}`],
      reading: "The event directory is read as organizing theatre: sessions, claims, relations, and handoffs become a semantic manifold.",
      loci: loci.slice(0, 8),
    }),
    infotile({
      id: "tile:work-locus-claims",
      title: "Work-Locus Claims",
      role: "coordination-cover",
      charge: chargeFor({ positive: activeClaims.length > 0, negative: claimConflicts.length > 0, reason: activeClaims.length === 0 ? "no active claims" : "claims mark occupied edit loci" }),
      evidence: activeClaims.map((claim) => String(claim?.claimId ?? claim?.id ?? claim?.grants ?? "claim")).slice(0, 8),
      reading: "Claims are stage positions in the cover nerve; overlaps add edges and cycles add coordination cost.",
      loci: activeClaims.slice(0, 8),
    }),
    infotile({
      id: "tile:peer-field",
      title: "Peer Field",
      role: "collision-awareness-cover",
      charge: chargeFor({ positive: peerSessions.length > 0, negative: collisionAwareness.length > 0, reason: collisionAwareness.length > 0 ? "nearby peer loci overlap this lane" : "peer sessions are visible without overlap" }),
      evidence: peerSessions.map((peer) => `${peer.session}:${peer.updatedAt ?? "unknown"}`).slice(0, 8),
      reading: "Peer sessions are awareness, not assignment; collisions are kept visible instead of flattened.",
      loci: peerSessions.slice(0, 8),
    }),
    infotile({
      id: "tile:work-field",
      title: "Work Field",
      role: "endeavor-reading",
      charge: chargeFor({ positive: workFocus.length > 0 || workTheory.length > 0, negative: workSurface.freshness?.stale === true, reason: workSurface.freshness?.stale === true ? "static work surface is stale" : "work vocabulary and focus are readable" }),
      evidence: [
        ...workFocus.map((item) => item.id),
        ...workTheory.map((item) => item.key),
      ].slice(0, 12),
      reading: "The managed-operation projection gives the agent a work vocabulary and active carrier field.",
      loci: workFocus.slice(0, 8),
    }),
    infotile({
      id: "tile:archive-basis",
      title: "Archive Basis",
      role: "research-substrate-reading",
      charge: chargeFor({ positive: archiveBasis.length > 0, negative: false, reason: "content notes ground this session's interpretation" }),
      evidence: archiveBasis.map((item) => `${item.path} (${item.score})`).slice(0, 10),
      reading: "Research notes and papers are read as finite patches of the relational hull for this session.",
      loci: archiveBasis.slice(0, 8),
    }),
  ];
  const cover = infotileCoverFor({ session, tiles, peerSessions, collisionAwareness, activeClaims, relations });
  const seenCharges = [...new Set(tiles.map((tile) => tile.charge.symbol))];
  const conflictTiles = tiles.filter((tile) => tile.charge.symbol === "top").length;
  const positiveTiles = tiles.filter((tile) => tile.charge.positive).length;
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.infotile-field",
    generatedAt,
    observer: { session, harness, hookEventName: hook },
    claim: "The local dev surface is readable as InfoTiles: runtime cells are coloured in FOUR, related through the MASH/RWIL witness shift, and measured by a cover-nerve coordination invariant.",
    spine: INFOTILE_SPINE,
    source: {
      witnessShift: "sites/dev.bare-cedar-fog.emsenn.net/data/log/YYYY/MM/DD/YYYY-MM-DD-root-log.jsonl",
      factorMaps: [
        "hook/tool payload -> ActivityStreams Activity",
        "ActivityStreams Activity -> organizing theatre locus/relation",
        "locus/relation/work carrier -> FOUR-valued InfoTile",
      ],
      promptTerms: terms,
    },
    tiles,
    invariants: {
      chromatic: {
        kind: "infotile.chromatic-operational-reading",
        palette: "Belnap FOUR / RelMath.Charge",
        colorsSeen: seenCharges,
        positiveTiles,
        conflictTiles,
        lowerBoundBits: Number(Math.log2(Math.max(1, seenCharges.length)).toFixed(6)),
        claim: "This is the runtime's cheap palette reading, not a general chromatic-polynomial computation.",
      },
      cohomological: {
        kind: "infotile.cover-nerve-h1",
        vertices: cover.vertices.length,
        edges: cover.edges.length,
        components: cover.components,
        h1Rank: cover.h1Rank,
        coordinationFree: cover.h1Rank === 0,
        claim: "For this finite cover nerve, H1 rank is |E|-|V|+|C|; nonzero rank is coordination cost.",
        edges: cover.edges.slice(0, 24),
      },
      sofic: {
        kind: "infotile.sofic-factor-reading",
        witnessShift: "sites/dev.bare-cedar-fog.emsenn.net/data/log/YYYY/MM/DD/YYYY-MM-DD-root-log.jsonl",
        factor: "runtime witness cells are projected through local factor maps to a finite FOUR-coloured tile alphabet",
        kernel: ICK_SERVICE_FACE,
        claim: "The site does not own the kernel; it reads a local witness shift through the mounted ICK service face.",
      },
      spectral: {
        kind: "infotile.spectral-shadow",
        status: "operational-shadow",
        reading: "The accepted kernel shadow is Salem: sharp shared core plus bounded residual disagreement, not pretend-perfect pure-point agreement.",
        claim: "The residual is useful signal for agent coordination; do not erase it.",
      },
    },
    nextInterfaces: [
      { href: ICK_JUPYTER_INFOTILE_VIEW.notebookHref, purpose: "Open this field through the ICK Jupyter InfoTile notebook." },
      { href: ICK_JUPYTER_INFOTILE_VIEW.dataHref, purpose: "Read the JSONL data slice backing the ICK Jupyter InfoTile notebook." },
      { href: "/mash/manifold.html", purpose: "Inspect the underlying organizing-theatre manifold." },
      { href: ICK_SERVICE_FACE.discoveryHref, purpose: "Read the mounted ICK service face that supplies the stable kernel boundary." },
    ],
  };
}

function chargeFor({ positive, negative, reason }) {
  const symbol = positive && negative ? "top" : positive ? "true" : negative ? "false" : "bottom";
  return {
    kind: "relmath.charge",
    symbol,
    positive: Boolean(positive),
    negative: Boolean(negative),
    knowledgeRank: Number(Boolean(positive)) + Number(Boolean(negative)),
    truthPolarity: positive === negative ? "balanced" : positive ? "affirming" : "rejecting",
    reason,
  };
}

function infotile({ id, title, role, charge, evidence, reading, loci }) {
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.infotile",
    id,
    title,
    role,
    charge,
    evidence: evidence.filter((item) => item !== null && item !== undefined && String(item).trim() !== ""),
    reading,
    loci,
  };
}

function infotileCoverFor({ session, tiles, peerSessions, collisionAwareness, activeClaims, relations }) {
  const vertices = new Set(tiles.map((tile) => tile.id));
  vertices.add(`session:${session}`);
  const edges = [];
  const addEdge = (source, target, reason) => {
    if (source === null || source === undefined || target === null || target === undefined || source === target) return;
    const left = String(source);
    const right = String(target);
    vertices.add(left);
    vertices.add(right);
    edges.push({ source: left, target: right, reason });
  };
  addEdge("tile:observer-session", `session:${session}`, "observer tile reads current session");
  addEdge("tile:observer-session", "tile:mash-theatre", "session is staged inside MASH theatre");
  addEdge("tile:mash-theatre", "tile:ick-boundary", "MASH reads through the mounted ICK boundary");
  addEdge("tile:mash-theatre", "tile:work-locus-claims", "claims are loci in the theatre");
  addEdge("tile:work-field", "tile:archive-basis", "work focus is grounded by archive basis");
  for (const claim of activeClaims.slice(0, 12)) {
    const claimId = `claim:${claim?.claimId ?? claim?.id ?? claim?.grants ?? JSON.stringify(claim).slice(0, 32)}`;
    addEdge("tile:work-locus-claims", claimId, "active work-locus claim");
    addEdge("tile:mash-theatre", claimId, "claim appears as theatre stage position");
  }
  for (const peer of peerSessions.slice(0, 12)) {
    const peerId = `session:${peer.session}`;
    addEdge("tile:peer-field", peerId, "visible peer session");
    addEdge("tile:mash-theatre", peerId, "peer session participates in theatre");
  }
  for (const collision of collisionAwareness.slice(0, 24)) {
    addEdge(`session:${session}`, `session:${collision.peerSession ?? "peer"}`, `collision:${collision.path ?? "unknown"}`);
  }
  for (const relation of relations.slice(0, 24)) {
    addEdge(relation.source ?? relation.from ?? "tile:mash-theatre", relation.target ?? relation.to ?? "tile:mash-theatre", relation.reason ?? relation.kind ?? "modeled relation");
  }
  const components = connectedComponentCount([...vertices], edges);
  const h1Rank = Math.max(0, edges.length - vertices.size + components);
  return { vertices: [...vertices], edges, components, h1Rank };
}

function connectedComponentCount(vertices, edges) {
  const parent = new Map(vertices.map((vertex) => [vertex, vertex]));
  const find = (vertex) => {
    const current = parent.get(vertex) ?? vertex;
    if (current === vertex) return current;
    const root = find(current);
    parent.set(vertex, root);
    return root;
  };
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent.set(leftRoot, rightRoot);
  };
  for (const edge of edges) unite(edge.source, edge.target);
  return new Set(vertices.map(find)).size;
}

function modeledAgentSemioticHubFor({
  generatedAt,
  session,
  harness,
  hook,
  current,
  yourLane,
  peerSessions,
  peerEvents,
  collisionAwareness,
  state,
  eventLog,
  hookSurface,
  mcpSurface,
  workSurface,
}) {
  const events = eventLog.map(eventDigest);
  const activities = eventLog.map((event) => event.activity).filter(isActivity);
  const mashActivities = [...activities, ...admittedMashActionActivities()];
  const activeClaims = [...organizingTheatreActiveWorkLocusClaims(eventLog, MASH_SERVICE_CONFIG, {
    ...MASH_WORK_LOCUS_OPTIONS,
    now: new Date(generatedAt),
  })];
  const oldestEventAt = events[0]?.at ?? null;
  const newestEventAt = events.at(-1)?.at ?? null;
  const harnesses = new Set([harness]);
  const loci = [
    agentLocus({
      role: "observer",
      session,
      updatedAt: current?.updatedAt ?? newestEventAt,
      hooks: Number(current?.hooks ?? 0),
      harnesses: Array.isArray(current?.harnesses) ? current.harnesses : [harness],
      lane: yourLane,
    }),
    ...peerSessions.map((peer) => agentLocus({
      role: "peer",
      session: peer.session,
      updatedAt: peer.updatedAt ?? null,
      hooks: Number(peer.hooks ?? 0),
      harnesses: Array.isArray(peer.harnesses) ? peer.harnesses : [],
      lane: peer.lane,
    })),
  ];
  for (const locus of loci) for (const item of locus.harnesses) harnesses.add(item);
  return organizingTheatreModeledAgentSemioticHub({
    kind: MASH_PROFILE.kinds.modeledAgentSemioticHub,
    claim: "dev.bare-cedar-fog.emsenn.net is the local services/MASH surface where harness sessions, hook traces, focus loci, and shared work projections become a readable agent manifold.",
    generatedAt,
    observer: {
      session,
      harness,
      hookEventName: hook,
      locus: loci[0],
    },
    events,
    activities: mashActivities,
    sessionCount: Object.keys(state.sessions ?? {}).length,
    harnesses: [...harnesses],
    oldestEventAt,
    newestEventAt,
    activityPub: {
      kind: MASH_PROFILE.kinds.activityPub,
      claim: "The MASH trace is read as ActivityStreams activities: harness sessions are Actors, hook/tool events and admitted package actions are Activities, and the manifold window is an OrderedCollection outbox.",
      federation: organizingTheatreActivityPubFederationProjection(
        mashActivities,
        MASH_SERVICE_CONFIG,
        organizingTheatreAgentActorsForLoci(loci, MASH_SERVICE_CONFIG, {
          events: eventLog,
          activities: mashActivities,
        }),
        MASH_PROFILE.activityPubFederation,
      ),
    },
    channels: {
      ick: {
        routeBase: ICK_SERVICE_FACE.basePath,
        discovery: ICK_SERVICE_FACE.discoveryHref,
        openapi: ICK_SERVICE_FACE.openApiHref,
        mcp: ICK_SERVICE_FACE.mcpHref,
        witnessLog: ICK_SERVICE_FACE.witnessLog,
        claim: ICK_SERVICE_FACE.claim,
      },
      activitypub: {
        actor: "/",
        actors: "/agents/{harness}/{session}",
        outbox: MASH_OUTBOX_IRI,
        eventObject: "ActivityStreams Activity.object",
      },
      admittedActions: {
        routeBase: "/",
        admission: "relating.action[]",
        activitySurface: MASH_OUTBOX_IRI,
        claim: "Executable MASH actions are authored as Relating action carriers and projected as Activities in this outbox.",
      },
      hooks: hookSurface,
      mcp: mcpSurface,
      contextSurfaces: [],
    },
    loci,
    relations: organizingTheatreModeledRelations(loci, collisionAwareness, activeClaims, {
      observerSession: session,
      relationKind: MASH_PROFILE.kinds.agentRelation,
      coPresentReason: "recent hook state present in the shared dev.bare-cedar-fog.emsenn.net event field",
    }),
    workField: {
      activeCarriers: activeCarriers(workSurface.endeavor),
      heldOpinions: heldOpinions(workSurface.opinions),
      freshness: workSurface.freshness,
    },
    activeClaims,
    claimConflicts: [...organizingTheatreWorkLocusClaimConflictsAcross(activeClaims, MASH_SERVICE_CONFIG, MASH_WORK_LOCUS_OPTIONS)],
    recentEvents: [...events.slice(-8), ...peerEvents].slice(-16),
    nextInterfaces: [
      { href: "/outbox", purpose: "Read the ActivityStreams OrderedCollection outbox backing this manifold." },
      { bin: "claim-locus", href: "/claim-locus", purpose: "Claim or release a workspace ActivityPub Capability before material edits so peer agents can coordinate." },
      { href: ICK_JUPYTER_INFOTILE_VIEW.notebookHref, purpose: "Inspect peer/session/work witness rows through the ICK Jupyter InfoTile notebook." },
      { href: ICK_SERVICE_FACE.discoveryHref, purpose: "Inspect the ICK action discovery before adding or selecting model-runtime actuators." },
    ],
  }, MASH_SERVICE_CONFIG);
}

function agentLocus({ role, session, updatedAt, hooks, harnesses, lane }) {
  return organizingTheatreAgentLocus({
    role,
    session,
    updatedAt,
    hooks,
    harnesses,
    lane,
  }, {
    kind: MASH_PROFILE.kinds.agentLocus,
  });
}

function admittedMashActionActivities() {
  return projectAdmittedMashActionActivities(
    ADMITTED_MASH_ACTIONS,
    MASH_SERVICE_CONFIG,
    {
      packageName: "@emsenn/dev.bare-cedar-fog.emsenn.net",
      admission: "relating.action[]",
      sourceAdmission: "sites/dev.bare-cedar-fog.emsenn.net/src/mash-actions.mts",
    },
  );
}

function parseActivityActorIri(id) {
  return organizingTheatreAgentActorSession(id, MASH_SERVICE_CONFIG);
}

function claimConflictsFor(claim, activeClaims) {
  const normalized = organizingTheatreWorkLocusClaimFrom(claim, MASH_WORK_LOCUS_OPTIONS);
  return normalized === null ? [] : [...organizingTheatreWorkLocusClaimConflictsFor(normalized, activeClaims, MASH_SERVICE_CONFIG, MASH_WORK_LOCUS_OPTIONS)];
}

async function readAgentEventLog(limit) {
  return (await readIckAgentEventLog(limit))
    .sort((left, right) => String(left.at ?? "").localeCompare(String(right.at ?? "")))
    .slice(-limit);
}

async function readIckAgentEventLog(limit) {
  if (limit <= 0) return [];
  const rows = [];
  for (const date of recentIckDates(Number(process.env.EMSENN_DEV_ICK_EVENT_DAYS ?? 3))) {
    const { store, feed } = invocationStore(ICK_ROOT, "root", `${date}T23:59:59.999Z`);
    try {
      rows.push(...readWitnessLog(store, feed));
    } catch {
      // The canonical ICK log is advisory for orientation; absence is an empty feed.
    }
  }
  return [...organizingTheatreAgentEventsFromWitnessRows(rows, MASH_SERVICE_CONFIG, {
      ...MASH_PROFILE.eventActivity,
      kind: "dev.bare-cedar-fog.emsenn.net.agent-event",
      cockpit: "dev.bare-cedar-fog.emsenn.net",
      recordedEventKind: "dev.bare-cedar-fog.emsenn.net.agent-event",
      hookAdmissionKind: "information-coherence-kernel.hook.admission",
      hookSource: "information-coherence-kernel.admit-hook-event",
      root: ICK_ROOT,
      namespace: "root",
    })]
    .sort((left, right) => String(left.at ?? "").localeCompare(String(right.at ?? "")))
    .slice(-limit);
}

function recentIckDates(days) {
  const count = Math.min(30, Math.max(1, Number.isFinite(days) ? Math.trunc(days) : 3));
  const dates = [];
  const now = new Date();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

function eventDigest(event) {
  const object = isActivity(event.activity) && event.activity.object !== null && typeof event.activity.object === "object"
    ? event.activity.object
    : {};
  return {
    at: event.at,
    source: event.source,
    hookEventName: event.hookEventName,
    harness: event.harness,
    session: event.session,
    activity: isActivity(event.activity)
      ? {
          id: event.activity.id ?? null,
          type: event.activity.type,
          actor: event.activity.actor,
          objectType: typeof object.type === "string" ? object.type : null,
          content: typeof object.content === "string" ? object.content : null,
        }
      : null,
    cwd: typeof event.payload?.cwd === "string" ? workspacePath(event.payload.cwd) : null,
    toolName: typeof event.payload?.tool_name === "string" ? event.payload.tool_name : null,
    id: event.id,
  };
}

function latestSessionGate(events) {
  const gate = [...events]
    .reverse()
    .find((event) => typeof event.gate === "string" || event.source === "dev.bare-cedar-fog.emsenn.net.check-stop-gate");
  if (gate === undefined) return null;
  return {
    at: gate.at ?? null,
    gate: typeof gate.gate === "string" ? gate.gate : null,
    reason: typeof gate.reason === "string" ? gate.reason : null,
    activeClaims: Array.isArray(gate.activeClaims) ? gate.activeClaims : [],
    claimConflicts: Array.isArray(gate.claimConflicts) ? gate.claimConflicts : [],
  };
}

function laneFromEvents(events, payload) {
  const hookCounts = {};
  const toolCounts = {};
  const sources = {};
  const focus = new Set();
  let currentCwd = workspacePath(stringField(payload, "cwd"));
  let lastTool = null;
  let lastEventAt = null;
  for (const event of events) {
    hookCounts[event.hookEventName ?? "HookEvent"] = (hookCounts[event.hookEventName ?? "HookEvent"] ?? 0) + 1;
    sources[event.source ?? "unknown"] = (sources[event.source ?? "unknown"] ?? 0) + 1;
    const eventCwd = workspacePath(event.payload?.cwd);
    if (eventCwd !== null) currentCwd = eventCwd;
    const toolName = typeof event.payload?.tool_name === "string" ? event.payload.tool_name : null;
    if (toolName !== null) {
      lastTool = toolName;
      toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
    }
    for (const item of pathCandidates(event.payload, eventCwd)) focus.add(item);
    lastEventAt = event.at ?? lastEventAt;
  }
  for (const item of pathCandidates(payload, workspacePath(payload.cwd))) focus.add(item);
  if (currentCwd !== null) focus.add(currentCwd);
  return {
    kind: "dev.bare-cedar-fog.emsenn.net.agent-lane",
    currentCwd,
    lastEventAt,
    lastTool,
    hookCounts: sortedCounts(hookCounts),
    toolCounts: sortedCounts(toolCounts),
    sources: sortedCounts(sources),
    focusPaths: [...focus].filter(Boolean).sort().slice(0, 24),
  };
}

function collisionAwarenessFor(yourLane, peerSessions) {
  return [...organizingTheatreCollisionAwarenessFor(yourLane, peerSessions)];
}

function strongestPathOverlap(yourPaths, peerPath) {
  return organizingTheatreStrongestPathOverlap(yourPaths, peerPath);
}

function sortedCounts(counts) {
  return Object.freeze(Object.entries(counts)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]))
    .map(([name, count]) => Object.freeze({ name, count })));
}

function joinCounts(counts) {
  if (counts.length === 0) return "none";
  return counts.slice(0, 4).map((item) => `${item.name}:${item.count}`).join(", ");
}

function pathCandidates(value, cwd = null) {
  const out = new Set();
  collectPathCandidates(value, cwd, out, 0);
  return [...out].filter(Boolean).sort();
}

function collectPathCandidates(value, cwd, out, depth) {
  if (depth > 5 || value === null || value === undefined) return;
  if (typeof value === "string") {
    for (const candidate of stringPathCandidates(value, cwd)) out.add(candidate);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPathCandidates(item, cwd, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "transcript_path") continue;
      collectPathCandidates(item, cwd, out, depth + 1);
    }
  }
}

function stringPathCandidates(value, cwd) {
  const candidates = [];
  const absolute = value.match(/[A-Za-z]:\\[^\s"'<>|]+/gu) ?? [];
  for (const item of absolute) candidates.push(workspacePath(item));
  const relative = value.match(/(?:^|[\s"'`(])((?:apps|content|dev|lean|lib|packages|services|sites|src|\.claude|\.codex|\.vscode)[/\\][A-Za-z0-9._~@()+\-/\\]*)/gu) ?? [];
  for (const raw of relative) {
    const item = raw.trim().replace(/^["'`(]/u, "");
    candidates.push(workspacePath(item, cwd));
  }
  return candidates.filter((item) => item !== null && !item.startsWith(".codex/sessions/") && !item.startsWith(".claude/projects/"));
}

function workspacePath(value, cwd = null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const trimmed = value.trim().replace(/[),.;:\]]+$/u, "");
  const normalizedRoot = REPO_ROOT.replaceAll("\\", "/").toLowerCase();
  let normalized = trimmed.replaceAll("\\", "/");
  if (/^[A-Za-z]:\//u.test(normalized)) {
    const lower = normalized.toLowerCase();
    if (lower === normalizedRoot) return ".";
    if (lower.startsWith(`${normalizedRoot}/`)) return normalized.slice(REPO_ROOT.length + 1).replaceAll("\\", "/");
    return null;
  }
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.startsWith("../")) {
    if (cwd === null || cwd === ".") return null;
    return path.posix.normalize(path.posix.join(cwd, normalized));
  }
  if (normalized === ".") return ".";
  if (/^src(?:\/|$)/u.test(normalized) && cwd !== null && cwd !== ".") return path.posix.normalize(path.posix.join(cwd, normalized));
  if (/^(?:apps|content|dev|lean|lib|packages|services|sites|src|\.claude|\.codex|\.vscode)(?:\/|$)/u.test(normalized)) return normalized.replace(/\/+$/u, "");
  if (cwd !== null && cwd !== "." && /^[A-Za-z0-9._~@()+-]+(?:\/[A-Za-z0-9._~@()+-]+)*$/u.test(normalized)) {
    return path.posix.normalize(path.posix.join(cwd, normalized));
  }
  return null;
}

async function readHookSurface() {
  return {
    codex: await readCodexHooks(),
    claude: await readClaudeHooks(),
  };
}

async function readCodexHooks() {
  const file = path.join(REPO_ROOT, ".codex", "hooks.json");
  const parsed = await readJson(file, null);
  if (parsed === null || parsed.hooks === null || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) return null;
  return {
    path: ".codex/hooks.json",
    events: Object.entries(parsed.hooks).map(([event, groups]) => ({
      event,
      count: Array.isArray(groups)
        ? groups.reduce((sum, group) => sum + (Array.isArray(group?.hooks) ? group.hooks.length : 0), 0)
        : 0,
    })),
  };
}

async function readClaudeHooks() {
  const file = path.join(REPO_ROOT, ".claude", "settings.json");
  const parsed = await readJson(file, null);
  if (parsed === null || parsed.hooks === null || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) return null;
  return {
    path: ".claude/settings.json",
    events: Object.entries(parsed.hooks).map(([event, groups]) => ({
      event,
      count: Array.isArray(groups)
        ? groups.reduce((sum, group) => sum + (Array.isArray(group?.hooks) ? group.hooks.length : 0), 0)
        : 0,
    })),
  };
}

async function readMcpSurface() {
  const files = [".mcp.json", ".lsp-mcp.json", ".vscode/mcp.json", ".claude/settings.json", ".codex/hooks.json"];
  return Promise.all(files.map(async (relative) => {
    const file = path.join(REPO_ROOT, relative);
    try {
      const info = await stat(file);
      return { path: relative, present: true, bytes: info.size };
    } catch {
      return { path: relative, present: false, bytes: 0 };
    }
  }));
}

async function archiveContextBasis(payload, options = {}) {
  const terms = new Set([
    "agent",
    "agents",
    "swarm",
    "multiagent",
    "context",
    "spacesuit",
    "cockpit",
    "harness",
    "handoff",
    "trace",
    "governance",
    "working",
    "shared-field",
    "coordination",
    "lifecycle",
    "milestone",
    "endeavor",
    ...promptTerms(payload),
  ]);
  const archiveRoots = [
    path.join(REPO_ROOT, "content", "_archive"),
    path.join(REPO_ROOT, "content", "mark"),
  ];
  const limit = Number(options.archiveLimit ?? 8);
  const scanLimit = Number(options.archiveScanLimit ?? process.env.EMSENN_DEV_ARCHIVE_SCAN_LIMIT ?? 0);
  const files = uniqueFiles([
    ...await seededArchiveFiles(),
    ...await collectMarkdownFilesFromRoots(archiveRoots, scanLimit),
  ]);
  const ranked = [
    ...vaultContextHits(terms, options),
  ];
  for (const file of files) {
    const relative = path.relative(REPO_ROOT, file).replaceAll("\\", "/");
    const pathScore = scoreText(relative.toLowerCase(), terms) * 3;
    let body = "";
    try {
      body = (await readFile(file, "utf8")).slice(0, 8_000);
    } catch {
      continue;
    }
    const score = pathScore + scoreText(body.toLowerCase(), terms);
    if (score <= 0) continue;
    ranked.push({
      path: relative,
      score,
      claim: firstMeaningfulLine(body) ?? relative.split("/").at(-1) ?? relative,
    });
  }
  return dedupeRankedByPath(ranked
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
  ).slice(0, limit);
}

function vaultContextHits(terms, options = {}) {
  const root = path.join(REPO_ROOT, "content");
  const limit = Number(options.archiveVaultLimit ?? process.env.EMSENN_DEV_ARCHIVE_VAULT_LIMIT ?? 6);
  const maxScan = Number(options.archiveVaultMaxScan ?? process.env.EMSENN_DEV_ARCHIVE_VAULT_MAX_SCAN ?? 300);
  const perQuery = Number(options.archiveVaultHitsPerQuery ?? 1);
  const queries = vaultQueries(terms).slice(0, Number(options.archiveVaultQueries ?? 4));
  const regions = String(options.archiveVaultRegions ?? process.env.EMSENN_DEV_ARCHIVE_VAULT_REGIONS ?? "_archive")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
  const hits = [];
  for (const query of queries) {
    for (const region of regions) {
      if (hits.length >= limit) return hits;
      let result;
      try {
        result = grepAddressedText(root, { query, path: region, limit: perQuery, maxScan });
      } catch {
        continue;
      }
      for (const hit of result.hits) {
        const relative = `content/${hit.path}`;
        hits.push({
          path: relative,
          score: 12 + scoreText(`${query} ${relative}`.toLowerCase(), terms) * 3 + scoreText(hit.context.toLowerCase(), terms),
          claim: hit.context,
          line: hit.line,
          source: "organizing-a-knowledge-vault.grep-text",
        });
        if (hits.length >= limit) return hits;
      }
    }
  }
  return hits;
}

function vaultQueries(terms) {
  return uniqueStrings([
    "shared field",
    "swarm coordination",
    "common knowledge",
    "context spacesuit",
    "work item",
    "work unit",
    "agentic swarm",
    "governance",
    "lifecycle",
    ...[...terms]
      .map((term) => term.replace(/[-_]+/gu, " ").trim())
      .filter((term) => term.length >= 4 && term.length <= 48),
  ]).slice(0, 24);
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function dedupeRankedByPath(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.path}:${item.line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function seededArchiveFiles() {
  const relativeFiles = [
    "content/_archive/animating/content/becoming/doing/working/governing/content/individual/content/agent/acting/loading-context-spacesuit/loading-context-spacesuit.md",
    "content/_archive/animating/content/becoming/doing/working/governing/content/individual/content/agent/acting/loading-context-spacesuit/_archive/context-spacesuits-in-agentic-ai.md",
    "content/_archive/animating/content/becoming/doing/working/governing/content/individual/content/agent/content/artificial-intelligence/machine-learning/neural-network/language-models/agentic-systems/multiagent-systems/archive/context-spacesuits-in-agentic-ai.md",
    "content/_archive/animating/content/becoming/doing/working/governing/content/individual/content/agent/content/artificial-intelligence/machine-learning/neural-network/language-models/agentic-systems/multiagent-systems/terms/context-spacesuit.md",
    "content/_archive/animating/content/becoming/doing/working/working.md",
    "content/_archive/animating/content/becoming/doing/working/governing/governing.md",
    "content/_archive/computing/computer-networks/distributed-systems/archive/tech-messaging-systems-for-agentic-systems.md",
    "content/mark/content/utterance/articulating/content/articulation-cell/content/potential-articulation-cell/predicating/content/predication-cell/content/potential-predication-cell/positing/content/pre-bilattice/content/bilattice/_archive/predication-felber-task-sheaf-d-frame-translation.md",
    "content/mark/content/utterance/articulating/content/articulation-cell/content/potential-articulation-cell/predicating/content/predication-cell/content/potential-predication-cell/positing/content/pre-bilattice/content/bilattice/_archive/predication-bilattice-k-axiom-multi-agent-epistemic.md",
    "content/mark/content/utterance/articulating/content/articulation-cell/content/potential-articulation-cell/predicating/content/predication-cell/content/potential-predication-cell/positing/content/valuation/content/knowledge-least-valuation/settling/content/bigraded-diamond/_archive/x-1718946708-kz-diamond-hierarchical-swarm-coordination.md",
    "content/mark/content/utterance/articulating/content/articulation-cell/content/potential-articulation-cell/predicating/content/predication-cell/content/potential-predication-cell/positing/content/valuation/content/knowledge-least-valuation/settling/_archive/predication-bucket-2-multi-agent-epistemic-settling.md",
    "content/mark/content/utterance/articulating/content/articulation-cell/content/potential-articulation-cell/predicating/content/predication-cell/content/potential-predication-cell/positing/content/valuation/content/knowledge-least-valuation/settling/_archive/predication-bucket-2-aperiodic-swarm-classification.md",
  ];
  const files = [];
  for (const relative of relativeFiles) {
    const full = path.join(REPO_ROOT, relative);
    try {
      const info = await stat(full);
      if (info.isFile()) files.push(full);
    } catch {
      // Archive topology is still being normalized; missing seeds are not fatal.
    }
  }
  return files;
}

function uniqueFiles(files) {
  return [...new Set(files)];
}

async function collectMarkdownFilesFromRoots(roots, limit) {
  if (limit <= 0) return [];
  const files = [];
  for (const root of roots) {
    if (files.length >= limit) break;
    files.push(...await collectMarkdownFiles(root, limit - files.length));
  }
  return files;
}

async function collectMarkdownFiles(root, limit) {
  const out = [];
  const queue = [root];
  while (queue.length > 0 && out.length < limit) {
    const dir = queue.shift();
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(full);
      } else if (entry.isFile() && /\.(md|mdx)$/iu.test(entry.name)) {
        out.push(full);
        if (out.length >= limit) break;
      }
    }
  }
  return out;
}

function promptTerms(payload) {
  const source = ["prompt", "user_prompt", "message", "text"]
    .map((key) => stringField(payload, key))
    .filter(Boolean)
    .join(" ");
  return [...new Set(source.toLowerCase().split(/[^a-z0-9._/-]+/u)
    .filter((term) => term.length >= 4)
    .slice(0, 24))];
}

function scoreText(text, terms) {
  let score = 0;
  for (const term of terms) if (text.includes(term)) score += 1;
  return score;
}

function firstMeaningfulLine(body) {
  for (const line of body.split(/\r?\n/u)) {
    const trimmed = line.replace(/^#+\s*/u, "").trim();
    if (trimmed.length >= 20 && !trimmed.startsWith("---") && !trimmed.includes("```")) return trimmed.slice(0, 240);
  }
  return null;
}

function hash(value) {
  let h = 2166136261;
  for (const char of JSON.stringify(value)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function mergeSessionState(sessions, eventState) {
  const prior = sessions[eventState.session] ?? { session: eventState.session, hooks: 0, harnesses: [] };
  const priorUpdatedAt = typeof prior.updatedAt === "string" ? prior.updatedAt : "";
  const nextUpdatedAt = typeof eventState.updatedAt === "string" ? eventState.updatedAt : "";
  sessions[eventState.session] = {
    session: eventState.session,
    updatedAt: nextUpdatedAt > priorUpdatedAt ? nextUpdatedAt : priorUpdatedAt || null,
    hooks: Number(prior.hooks ?? 0) + Number(eventState.hooks ?? 1),
    harnesses: [...new Set([
      ...(Array.isArray(prior.harnesses) ? prior.harnesses : []),
      ...(Array.isArray(eventState.harnesses) ? eventState.harnesses : []),
    ])],
    latest: nextUpdatedAt >= priorUpdatedAt ? eventState.latest : prior.latest,
  };
}

function compactPayload(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return compactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 5) return "[depth-truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 32).map((item) => compactPayload(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 80)) {
      out[key] = compactPayload(item, depth + 1);
    }
    return out;
  }
  return String(value);
}

function compactString(value) {
  const limit = Number(process.env.EMSENN_DEV_HOOK_STRING_LIMIT ?? 4_000);
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...[truncated ${value.length - limit} chars]`;
}
