/**
 * @skill enforcing-mesh-scope
 * @verb-phrase enforcing mesh scope
 * @closure-kind process
 * @description Carries the firm's one adopted mesh-scope classifier and enterprise-install admission gate as an importable shared module. Use wherever a management instrument must distinguish operated territory from a checked-out sovereign submodule, admit one exact installer request, or revalidate that the admitted filesystem evidence has not changed; project this carrier with project-a-skill instead of copying its classifier.
 *
 * @precondition inspectMeshScope receives an existing authority root and subject directory; enterprise-install admission additionally receives an existing git worktree authority root, existing source and target directories, and a recognized installer, operation, and mode
 * @precondition callers treat this observable-filesystem gate as a correctness and sovereignty boundary, not as a security boundary against a hostile process holding the same operating-system write permissions
 * @postcondition inspectMeshScope classifies a boundary exactly when a strict descendant component carries a .git marker whose followed stat is a file, preserving the authority root's own marker as worktree evidence rather than a boundary
 * @postcondition admitEnterpriseInstall issues an opaque admission only when source and target are inside the authority root without crossing a classified boundary, bound to the exact installer, operation, mode, paths, and observed filesystem snapshot
 * @postcondition revalidateEnterpriseInstall accepts only an admission issued by this module whose request and observed filesystem snapshot remain unchanged
 * @witness inspectMeshScope returns the canonical authority root, subject, boundary list, deepest owner, and component and marker snapshot
 * @witness admission returns the canonical request, its SHA-256, and source and target snapshots; every refusal is a MeshScopeError carrying the facts that settled it
 *
 * This file is the policy home. Its projected directories are byte-identical
 * carriers for consumers; they are not independent implementations. In
 * particular, neither a consumer nor a projection may restate the `.git`
 * file test that the adopted mesh-scope decision assigns here.
 */

import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";

const INSTALLERS = new Set(["claude", "codex"]);
const OPERATIONS = new Set(["list", "install", "reinstall", "clean"]);
const MODES = new Set(["apply", "dry-run"]);
const issuedAdmissions = new WeakSet();

// This is a correctness and sovereignty gate over observable filesystem
// state, not a security boundary against a hostile process with the same OS
// write permissions. Filesystem ownership and permissions carry that layer.

export class MeshScopeError extends Error {
  constructor(message, facts = {}) {
    super(message);
    this.name = "MeshScopeError";
    this.facts = facts;
  }
}


function canonicalDirectory(label, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new MeshScopeError(`${label} must name an existing directory`, { [label]: value ?? null });
  }
  let canonical;
  try {
    canonical = realpathSync(resolve(value));
    if (!statSync(canonical).isDirectory()) throw new Error("not a directory");
  } catch (error) {
    throw new MeshScopeError(`${label} '${value}' is not an existing directory`, {
      [label]: resolve(value),
      cause: error.message,
    });
  }
  return canonical;
}

function statRecord(path) {
  const lst = lstatSync(path);
  const followed = statSync(path);
  return Object.freeze({
    path,
    lstat: Object.freeze({ dev: lst.dev, ino: lst.ino, mode: lst.mode, size: lst.size, mtimeMs: lst.mtimeMs }),
    stat: Object.freeze({ dev: followed.dev, ino: followed.ino, mode: followed.mode, size: followed.size, mtimeMs: followed.mtimeMs }),
  });
}

function componentRecord(path) {
  const lst = lstatSync(path);
  const followed = statSync(path);
  return Object.freeze({
    path,
    lstat: Object.freeze({ dev: lst.dev, ino: lst.ino, mode: lst.mode }),
    stat: Object.freeze({ dev: followed.dev, ino: followed.ino, mode: followed.mode }),
  });
}

function markerRecord(component) {
  const marker = join(component, ".git");
  if (!existsSync(marker)) return Object.freeze({ path: marker, exists: false });
  const record = { ...statRecord(marker), exists: true };
  if (record.stat.mode && statSync(marker).isFile()) {
    record.contentSha256 = sha256Hex(readFileSync(marker));
  }
  return Object.freeze(record);
}

function contains(root, subject) {
  const rel = relative(root, subject);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function componentsFrom(root, subject) {
  const rel = relative(root, subject);
  if (rel === "") return [root];
  const components = [root];
  let at = root;
  for (const part of rel.split(sep)) {
    at = join(at, part);
    components.push(at);
  }
  return components;
}

function assertAuthorityWorktree(authorityRoot) {
  const marker = join(authorityRoot, ".git");
  if (!existsSync(marker)) {
    throw new MeshScopeError("authority root is not a git worktree root", {
      authorityRoot,
      marker,
    });
  }
  const followed = statSync(marker);
  if (!followed.isFile() && !followed.isDirectory()) {
    throw new MeshScopeError("authority root has an unreadable git worktree marker", {
      authorityRoot,
      marker,
    });
  }
}

/**
 * The one implementation of the adopted mesh-scope classifier.
 * A boundary is exactly a `.git` marker whose followed stat is a file.
 * The authority root's own marker is evidence of its worktree, not a boundary
 * inside its jurisdiction, so only the strict path below it is classified.
 */
export function inspectMeshScope({ authorityRoot: authorityArg, subject: subjectArg }) {
  const authorityRoot = canonicalDirectory("authorityRoot", authorityArg);
  const subject = canonicalDirectory("subject", subjectArg);
  if (!contains(authorityRoot, subject)) {
    return Object.freeze({
      authorityRoot,
      subject,
      inside: false,
      boundaries: Object.freeze([]),
      deepestOwner: null,
      snapshot: Object.freeze({ components: Object.freeze([]), markers: Object.freeze([]) }),
    });
  }

  const components = componentsFrom(authorityRoot, subject);
  const componentRecords = components.map(componentRecord);
  const markers = components.map(markerRecord);
  const boundaries = components
    .slice(1)
    .filter((component) => {
      const marker = join(component, ".git");
      return existsSync(marker) && statSync(marker).isFile();
    });
  return Object.freeze({
    authorityRoot,
    subject,
    inside: true,
    boundaries: Object.freeze(boundaries),
    deepestOwner: boundaries.at(-1) ?? null,
    snapshot: Object.freeze({
      components: Object.freeze(componentRecords),
      markers: Object.freeze(markers),
    }),
  });
}

function canonicalRequest(request) {
  if (!request || typeof request !== "object") throw new MeshScopeError("enterprise install request is absent");
  if (!INSTALLERS.has(request.installer)) throw new MeshScopeError(`unknown installer '${request.installer}'`);
  if (!OPERATIONS.has(request.operation)) throw new MeshScopeError(`unknown operation '${request.operation}'`);
  if (!MODES.has(request.mode)) throw new MeshScopeError(`unknown mode '${request.mode}'`);
  const authorityRoot = canonicalDirectory("authorityRoot", request.authorityRoot);
  assertAuthorityWorktree(authorityRoot);
  const sourceEnterprise = canonicalDirectory("sourceEnterprise", request.sourceEnterprise);
  const targetNode = canonicalDirectory("targetNode", request.targetNode);
  return Object.freeze({
    authorityRoot,
    sourceEnterprise,
    targetNode,
    installer: request.installer,
    operation: request.operation,
    mode: request.mode,
  });
}

function stableRequestText(request) {
  return JSON.stringify({
    authorityRoot: request.authorityRoot,
    sourceEnterprise: request.sourceEnterprise,
    targetNode: request.targetNode,
    installer: request.installer,
    operation: request.operation,
    mode: request.mode,
  });
}

function refusalFacts(request, role, scope, reason) {
  return {
    role,
    reason,
    authorityRoot: request.authorityRoot,
    subject: role === "source" ? request.sourceEnterprise : request.targetNode,
    boundaries: scope.boundaries,
    firstBoundary: scope.boundaries[0] ?? null,
    deepestOwner: scope.deepestOwner,
    installer: request.installer,
    operation: request.operation,
    mode: request.mode,
    remedy:
      "invoke the settlement-local installer with --authority-root naming that settlement and a source enterprise local to it",
  };
}

function capture(request) {
  const source = inspectMeshScope({ authorityRoot: request.authorityRoot, subject: request.sourceEnterprise });
  if (!source.inside) {
    throw new MeshScopeError("source lies outside the authority root", refusalFacts(request, "source", source, "outside-authority-root"));
  }
  if (source.boundaries.length) {
    throw new MeshScopeError("source crosses a sovereign mesh boundary", refusalFacts(request, "source", source, "sovereign-boundary"));
  }
  const target = inspectMeshScope({ authorityRoot: request.authorityRoot, subject: request.targetNode });
  if (!target.inside) {
    throw new MeshScopeError("target lies outside the authority root", refusalFacts(request, "target", target, "outside-authority-root"));
  }
  if (target.boundaries.length) {
    throw new MeshScopeError("target crosses a sovereign mesh boundary", refusalFacts(request, "target", target, "sovereign-boundary"));
  }
  return { source, target };
}

export function admitEnterpriseInstall(input) {
  const request = canonicalRequest(input);
  const scopes = capture(request);
  const admission = Object.freeze({
    kind: "enterprise-install-admission",
    request,
    requestSha256: sha256Hex(stableRequestText(request)),
    snapshot: Object.freeze({ source: scopes.source.snapshot, target: scopes.target.snapshot }),
  });
  issuedAdmissions.add(admission);
  return admission;
}

export function revalidateEnterpriseInstall(admission) {
  if (!admission || !issuedAdmissions.has(admission)) {
    throw new MeshScopeError("enterprise install admission was not issued by this gate");
  }
  const requestHash = sha256Hex(stableRequestText(admission.request));
  if (requestHash !== admission.requestSha256) {
    throw new MeshScopeError("mesh authority changed during operation", { reason: "request-changed" });
  }
  let scopes;
  try {
    scopes = capture(admission.request);
  } catch (error) {
    throw new MeshScopeError("mesh authority changed during operation", {
      reason: "scope-changed",
      cause: error.message,
      ...(error.facts ?? {}),
    });
  }
  const next = JSON.stringify({ source: scopes.source.snapshot, target: scopes.target.snapshot });
  const prior = JSON.stringify(admission.snapshot);
  if (next !== prior) {
    throw new MeshScopeError("mesh authority changed during operation", {
      reason: "filesystem-snapshot-changed",
      request: admission.request,
    });
  }
  return admission;
}
