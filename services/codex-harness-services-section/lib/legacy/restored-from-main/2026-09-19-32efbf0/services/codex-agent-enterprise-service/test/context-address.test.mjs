import assert from "node:assert/strict";
import test from "node:test";

import { contextAddressForHookEvent, contextResolverContract, parseCodexContextAddress } from "../src/context-address.mjs";
import { codexEnterpriseConfiguration } from "../src/configuration.mjs";

const ACTOR_SLUG = codexEnterpriseConfiguration().actorSlug;

test("each hook context derives one canonical typed selector and resolver", () => {
  const expected = {
    SessionStart: [`codex/actor/${ACTOR_SLUG}/continuity/session-start`, "CodexContinuityLocator", "observe_codex_session_context"],
    UserPromptSubmit: [`codex/actor/${ACTOR_SLUG}/prompt-cycle/active`, "CodexPromptContextLocator", "observe_codex_prompt_context"],
    PostToolUse: [`codex/actor/${ACTOR_SLUG}/evidence/current-tool-result`, "CodexToolEvidenceLocator", "observe_codex_tool_context"],
  };
  for (const [event, [address, type, operation]] of Object.entries(expected)) {
    assert.deepEqual(contextAddressForHookEvent(event), { address, type, resolver: operation });
    assert.deepEqual(contextResolverContract(address), { type: "CodexContextResolution", address, resourceType: type, operation, arguments: { address } });
  }
});

test("a context selector refuses noncanonical and hash-shaped substitutes", () => {
  assert.throws(() => parseCodexContextAddress("codex/prompt-cycle/active"), /canonical Codex proof-path selector/u);
  assert.throws(() => parseCodexContextAddress("urn:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), /canonical Codex proof-path selector/u);
});
