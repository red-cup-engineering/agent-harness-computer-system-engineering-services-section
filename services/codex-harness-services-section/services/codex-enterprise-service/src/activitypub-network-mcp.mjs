#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";

const ACTOR = "urn:ame:bare-cedar-fog-codex";
const DEFAULT_ORIGIN = "https://bare-cedar-fog.561.group";
const ACTOR_IDENTIFIER = "codex";
const ACCEPT = "application/activity+json, application/ld+json";
const UFTN_DISCOVERY_AGENT_CARD = "https://federated-capability-offer-discovery-cell-a2d7mjqbfa-uc.a.run.app/.well-known/agent-card.json";
const CLOUD_RUN_ACTUATOR_ORIGIN = "https://gcloud-cloud-run-actuator-1019481907460.us-central1.run.app";
const DEFAULT_RESPONSE_BYTES = 16_384;
const execFileAsync = promisify(execFile);

function origin() {
  return (process.env.UNION_ACTIVITYPUB_ORIGIN ?? DEFAULT_ORIGIN).replace(/\/$/u, "");
}
function url(path) { return `${origin()}${path}`; }

function httpsUrl(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be an HTTPS URL`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:") throw new TypeError(`${label} must be an HTTPS URL`);
  return parsed.href;
}

async function bearer() {
  const path = process.env.ACTIVITYPUB_INBOX_BEARER_TOKEN_FILE;
  return path ? (await readFile(path, "utf8")).trim() : null;
}

async function cloudRunIdentity() {
  const path = process.env.UFTN_CLOUD_RUN_IDENTITY_TOKEN_FILE;
  if (path) return (await readFile(path, "utf8")).trim();
  const executable = process.env.GCLOUD_EXECUTABLE ?? "/home/emsenn/.local/google-cloud-sdk/bin/gcloud";
  try {
    const { stdout } = await execFileAsync(executable, ["auth", "print-identity-token"], { maxBuffer: 1024 * 1024 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function cloudRunCapability() {
  const path = process.env.GCLOUD_CLOUD_RUN_ACTUATOR_TOKEN_FILE;
  return path ? (await readFile(path, "utf8")).trim() : null;
}

async function networkCredential(kind) {
  if (kind === "public") return null;
  if (kind === "google-identity") {
    const token = await cloudRunIdentity();
    if (!token) throw new Error("Google identity is unavailable from UFTN_CLOUD_RUN_IDENTITY_TOKEN_FILE or gcloud auth");
    return token;
  }
  if (kind === "activitypub-bearer") {
    const token = await bearer();
    if (!token) throw new Error("ACTIVITYPUB_INBOX_BEARER_TOKEN_FILE is required for ActivityPub bearer exchange");
    return token;
  }
  if (kind === "actuator-capability") {
    const token = await cloudRunCapability();
    if (!token) throw new Error("GCLOUD_CLOUD_RUN_ACTUATOR_TOKEN_FILE is required for Cloud Run actuation");
    return token;
  }
  throw new TypeError(`unknown network authentication ${kind}`);
}

function boundedBody(text, maximumBytes) {
  const bytes = Buffer.from(text);
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (bytes.byteLength > maximumBytes) return { digest, bytes: bytes.byteLength, truncated: true, prefix: bytes.subarray(0, Math.min(2048, bytes.byteLength)).toString("utf8") };
  try { return { digest, bytes: bytes.byteLength, truncated: false, value: text ? JSON.parse(text) : null }; }
  catch { return { digest, bytes: bytes.byteLength, truncated: false, value: text }; }
}

async function exchangeWithUnionActor(args) {
  const endpoint = httpsUrl(args.endpoint, "endpoint");
  const protocol = args.protocol;
  if (!args.body || typeof args.body !== "object" || Array.isArray(args.body)) throw new TypeError("body must be one JSON object");
  const authentication = args.authentication ?? "public";
  const token = await networkCredential(authentication);
  const maximumResponseBytes = args.maximumResponseBytes ?? DEFAULT_RESPONSE_BYTES;
  const headers = {
    accept: protocol === "activitypub" ? ACCEPT : "application/json",
    "content-type": protocol === "activitypub" ? "application/activity+json" : "application/json",
  };
  if (token && authentication === "actuator-capability") headers["x-actuator-capability"] = token;
  else if (token) headers.authorization = `Bearer ${token}`;
  if (protocol === "a2a-jsonrpc") {
    headers["a2a-version"] = args.a2aVersion ?? "1.0";
    if (Array.isArray(args.extensions) && args.extensions.length) headers["a2a-extensions"] = args.extensions.join(", ");
  }
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(args.body) });
  const text = await response.text();
  return {
    state: response.ok ? "exchanged" : response.status === 401 || response.status === 403 ? "authorization-required" : "provider-refused",
    protocol,
    endpoint,
    status: response.status,
    contentType: response.headers.get("content-type"),
    response: boundedBody(text, maximumResponseBytes),
  };
}

async function get(path, authenticated = false) {
  const headers = { accept: ACCEPT };
  if (authenticated) {
    const token = await bearer();
    if (!token) throw new Error("ACTIVITYPUB_INBOX_BEARER_TOKEN_FILE is required for authenticated inbox observation");
    headers.authorization = `Bearer ${token}`;
  }
  const response = await fetch(url(path), { headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 2000) }; }
  if (!response.ok) throw new Error(`ActivityPub ${response.status} for ${path}: ${JSON.stringify(body).slice(0, 1000)}`);
  return body;
}

async function getAbsolute(url, headers = {}) {
  const response = await fetch(url, { headers: { accept: ACCEPT, ...headers } });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 2000) }; }
  if (!response.ok) {
    return { state: response.status === 401 || response.status === 403 ? "authorization-required" : "obstructed", status: response.status, endpoint: url, body };
  }
  return { state: "reachable", endpoint: url, body };
}

function workOrders(collection) {
  const items = collection?.orderedItems ?? collection?.items ?? [];
  return items.filter((item) => {
    const value = item?.object ?? item;
    return /work|order|duty|obligation|task|mission|requirement|offer|dispatch/iu.test(`${item?.type ?? ""} ${value?.type ?? ""} ${value?.name ?? ""} ${value?.summary ?? ""} ${value?.content ?? ""}`);
  });
}

const tools = [
  { name: "observe_activitypub_codex_actor", description: "Read the sovereign Codex Actor projection from the live ActivityPub network.", inputSchema: { type: "object", additionalProperties: false } },
  { name: "observe_activitypub_codex_inbox", description: "Read current work-order, duty, obligation, task, and offer Activities addressed to the Codex Actor from the authenticated ActivityPub inbox.", inputSchema: { type: "object", additionalProperties: false } },
  { name: "observe_activitypub_codex_outbox", description: "Read the Codex Actor's network outbox, preserving provider and receiver Activities as network evidence.", inputSchema: { type: "object", additionalProperties: false } },
  { name: "observe_uftn_entry", description: "Read the live UFTN bounded capability-discovery Actor Card: the network entry surface, not a local substitute or one individual actuator.", inputSchema: { type: "object", additionalProperties: false } },
  { name: "observe_uftn_cloud_run_actuator", description: "Resolve the UFTN Cloud Run actuator through its federated endpoint. Returns its live card when authorized, or an exact authorization obstruction without claiming the actuator is absent.", inputSchema: { type: "object", additionalProperties: false } },
  { name: "observe_uftn_activitypub_actor", description: "Read one exact public ActivityPub actor in the UFTN by HTTPS actor URL.", inputSchema: { type: "object", required: ["actorUrl"], properties: { actorUrl: { type: "string", pattern: "^https://" } }, additionalProperties: false } },
  { name: "exchange_with_union_actor", description: "Send one bounded HTTPS ActivityPub or A2A JSON-RPC exchange from Codex to a Union Actor; credentials stay inside the MCP client and oversized responses return only a digest and bounded prefix.", inputSchema: { type: "object", required: ["protocol", "endpoint", "body"], properties: { protocol: { enum: ["activitypub", "a2a-jsonrpc"] }, endpoint: { type: "string", pattern: "^https://" }, body: { type: "object" }, authentication: { enum: ["public", "google-identity", "activitypub-bearer", "actuator-capability"], default: "public" }, a2aVersion: { type: "string", default: "1.0" }, extensions: { type: "array", items: { type: "string" } }, maximumResponseBytes: { type: "integer", minimum: 1024, maximum: 65536, default: 16384 } }, additionalProperties: false } },
];

async function call(name, args = {}) {
  if (name === "observe_activitypub_codex_actor") return { actor: ACTOR, endpoint: url(`/actors/${ACTOR_IDENTIFIER}`), projection: await get(`/actors/${ACTOR_IDENTIFIER}`) };
  if (name === "observe_activitypub_codex_inbox") {
    const collection = await get(`/actors/${ACTOR_IDENTIFIER}/inbox?page=true`, true);
    return { actor: ACTOR, source: url(`/actors/${ACTOR_IDENTIFIER}/inbox`), activities: workOrders(collection), totalItems: collection?.totalItems ?? null, networkOnly: true };
  }
  if (name === "observe_activitypub_codex_outbox") {
    const collection = await get(`/actors/${ACTOR_IDENTIFIER}/outbox?page=true`);
    return { actor: ACTOR, source: url(`/actors/${ACTOR_IDENTIFIER}/outbox`), activities: collection?.orderedItems ?? collection?.items ?? [], totalItems: collection?.totalItems ?? null, networkOnly: true };
  }
  if (name === "observe_uftn_entry") {
    const observed = await getAbsolute(UFTN_DISCOVERY_AGENT_CARD);
    return { network: "Union Federated Trade Network", role: "bounded capability discovery entry", ...observed };
  }
  if (name === "observe_uftn_cloud_run_actuator") {
    return {
      network: "Union Federated Trade Network",
      actor: "urn:ame:gcloud-cloud-run-actuator-service",
      actorEndpoint: `${CLOUD_RUN_ACTUATOR_ORIGIN}/actor`,
      inboxEndpoint: `${CLOUD_RUN_ACTUATOR_ORIGIN}/inbox`,
      outboxEndpoint: `${CLOUD_RUN_ACTUATOR_ORIGIN}/outbox`,
      a2aEndpoint: `${CLOUD_RUN_ACTUATOR_ORIGIN}/a2a`,
      capabilitySlot: "GCLOUD_CLOUD_RUN_ACTUATOR_TOKEN_FILE",
      ...await getAbsolute(`${CLOUD_RUN_ACTUATOR_ORIGIN}/.well-known/agent-card.json`),
    };
  }
  if (name === "observe_uftn_activitypub_actor") {
    const observed = await getAbsolute(httpsUrl(args.actorUrl, "actorUrl"));
    return { network: "Union Federated Trade Network", ...observed };
  }
  if (name === "exchange_with_union_actor") return exchangeWithUnionActor(args);
  throw new Error(`unknown ActivityPub network tool ${name}`);
}

function response(value) { return { content: [{ type: "text", text: JSON.stringify(value) }] }; }

const lines = (await import("node:readline")).createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  if (!line.trim()) continue;
  let request;
  try {
    request = JSON.parse(line);
    let result;
    if (request.method === "initialize") result = { protocolVersion: request.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "bare-cedar-fog-codex-activitypub-network", version: "1.1.0" } };
    else if (request.method === "notifications/initialized") continue;
    else if (request.method === "tools/list") result = { tools };
    else if (request.method === "tools/call") result = response(await call(request.params?.name, request.params?.arguments ?? {}));
    else if (request.method === "ping") result = {};
    else throw new Error(`unsupported JSON-RPC method ${request.method}`);
    if (request.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
  } catch (error) {
    if (request?.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: error instanceof Error ? error.message : String(error) } })}\n`);
  }
}
