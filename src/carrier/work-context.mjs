/**
 * The variable context of a carrier's prompts, under the carrier's ingress ceiling
 * (`flow-bounds.mjs`): the delegated method Resources, the signed Action, the governing terms and
 * the Source of an allocated duty, and the immutable proposal a receiver reviews. Each is inlined
 * while the prompt stays within the ceiling and otherwise written once into the task's directory,
 * named in the prompt by path, size and digest with a short summary.
 */
import { contextLines } from "./flow-bounds.mjs";

/** The lines of an allocated duty's variable context, keyed `method-resources`, `signed-action`,
 *  `governing` and `source`; a key is present only when the item carries it. */
export function workContext(item, { ingress, directory }) {
  return contextLines([
    ...(item.methodResources === undefined ? [] : [{ key: "method-resources", label: "The holder has delegated these actual installed method Resources, including their exact input contracts", value: item.methodResources,
      summary: `${item.methodResources.length} Resources: ${item.methodResources.map((resource) => resource.verb).join(", ")}` }]),
    ...(item.signedAction === undefined ? [] : [{ key: "signed-action", label: "Signed next Action and witnessed Resources", value: item.signedAction,
      summary: `fields ${Object.keys(item.signedAction).join(", ")}${Array.isArray(item.signedAction.resources) ? `; ${item.signedAction.resources.length} witnessed Resources` : ""}` }]),
    ...(item.governing === undefined ? [] : [{ key: "governing", label: "Canonical governing terms at allocation, with their source revisions", value: item.governing,
      summary: Array.isArray(item.governing) ? `${item.governing.length} terms` : `fields ${Object.keys(item.governing).join(", ")}` }]),
    ...(item.source === undefined || typeof item.source === "string" ? [] : [{ key: "source", label: "Source", value: item.source, summary: `fields ${Object.keys(item.source).join(", ")}` }]),
  ], { ...ingress, directory });
}

/** The line that gives a receiver the immutable proposal: inline within the ceiling, else its file. */
export function proposalContext(proposal, { ingress, directory }) {
  return contextLines([{ key: "proposal", label: "Review only this exact immutable proposal", value: proposal,
    summary: JSON.stringify({ receipt: proposal.receipt, scope: proposal.scope, work: typeof proposal.work === "string" ? proposal.work.slice(0, 200) : undefined, origin: proposal.origin }) }],
  { ...ingress, directory }).get("proposal");
}
