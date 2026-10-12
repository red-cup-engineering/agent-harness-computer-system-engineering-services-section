import { CODEX_SURFACE, renderCodex } from "./codex.mjs";
import { CLAUDE_SURFACE, renderClaude } from "./claude.mjs";

/** Every supported runtime as a parameterization: its declared surface and its renderer. Adding a runtime adds one entry. */
export const AGENT_RUNTIMES = Object.freeze({
  codex: Object.freeze({ surface: CODEX_SURFACE, render: renderCodex }),
  claude: Object.freeze({ surface: CLAUDE_SURFACE, render: renderClaude }),
});

export { CODEX_SURFACE, renderCodex, CLAUDE_SURFACE, renderClaude };
