// compileToolEvidence, folded local to this package — reduced fidelity.
//
// The historical @red-cup-engineering/tool-evidence-bounding-service package
// was deleted (32efbf028f0) alongside this one. Its full shape (content-
// addressed on-disk evidence store, bounded-discovery command rewriting,
// paging, budget degradation) depended on @red-cup-engineering/semantic-
// content-identify-service and @red-cup-engineering/data-custody-directory-
// service, both of which are gone from the house entirely — not renamed, not
// folded elsewhere, with zero other live consumers anywhere in the tree
// (confirmed by census). Reviving that whole subsystem for this package's
// only use of it — one representative cost line in its own harness-efficiency
// assay (src/harness-efficiency.mjs), which never reads a receipt back off
// disk — would itself be a one-file-package-sized capability with no second
// owner, so it is not restored whole.
//
// This module instead gives the assay exactly the slice of the original
// contract its one call site needs: a stable, content-addressed receipt id
// (still shaped `ni:///sha-256;<hex>`, so anything asserting that shape still
// holds) for one tool call's recorded output, with no filesystem effect. It
// is deliberately not exported under the historical package name and has no
// other consumer; a caller that needs paging, budgets, or bounded-discovery
// rewriting again should restore those against a live identity/custody
// service, not extend this stub.

import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
function jsonText(value) {
  return JSON.stringify(value ?? null);
}


/**
 * Compile one representative tool-evidence receipt: a content-addressed id
 * for the tool's recorded response, and the response's byte length. Does not
 * write, page, or bound anything; see module comment.
 * @param {{tool_name?: string, tool_input?: unknown, tool_response?: unknown}} input
 * @param {{actor?: string, provider?: string}} [options]
 * @returns {{receipt: {id: string, tool: string, provider: string, actor: string, outputBytes: number}}}
 */
export function compileToolEvidence(input, options = {}) {
  const tool = String(input?.tool_name ?? "unknown");
  const provider = options.provider ?? "provider-native";
  const actor = options.actor ?? "urn:ame:tool-evidence-bounding-service";
  const responseText = typeof input?.tool_response === "string" ? input.tool_response : jsonText(input?.tool_response ?? null);
  const outputBytes = Buffer.byteLength(responseText, "utf8");
  const id = semanticId({ tool, provider, actor, response: responseText });
  const receipt = Object.freeze({ id, tool, provider, actor, outputBytes });
  return Object.freeze({ receipt });
}
