/**
 * Heuristic completeness checks for a subagent dispatch brief -- pattern
 * matching, not judgment. A clean result is not a guarantee the brief is
 * complete; a warning is not proof it is bad. Use as a second pair of eyes.
 */

const DONE_SIGNAL_PATTERN =
  /\b(done|report|deliver|deliverable|return|produce|verify|verified|acceptance|complete when|counts as done|success criteri)/i;

const MIN_WORD_COUNT = 25;

/**
 * @param {{description?: string, prompt?: string, subagent_type?: string}} [toolInput]
 * @returns {string[]} Human-readable warnings; empty when no gap is detected.
 */
export function lintDispatchBrief(toolInput = {}) {
  const warnings = [];
  const prompt = typeof toolInput.prompt === "string" ? toolInput.prompt.trim() : "";

  if (!prompt) {
    warnings.push(
      "no prompt text found -- a dispatched agent has no memory of this " +
        "conversation and needs the full brief written out",
    );
    return warnings;
  }

  const wordCount = prompt.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_WORD_COUNT) {
    warnings.push(
      `brief is short (${wordCount} words) -- confirm it states the ` +
        "requested outcome, the exact scope, and what counts as done, " +
        "not just a one-line task name",
    );
  }

  if (!DONE_SIGNAL_PATTERN.test(prompt)) {
    warnings.push(
      "brief doesn't appear to say what \"done\" looks like -- add the " +
        "report format or acceptance check you expect back",
    );
  }

  return warnings;
}
