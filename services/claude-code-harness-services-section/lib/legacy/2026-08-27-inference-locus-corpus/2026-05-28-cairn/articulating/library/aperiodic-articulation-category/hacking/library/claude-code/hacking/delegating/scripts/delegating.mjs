// delegating : task -> subagent-settlement   [HACKING: name + subagent-as-object admitted]
//
// The conductor dispatches a task to N subagents (fungible, cheap inferring-enactors) and reconciles
// their settlements. Consensus is the knowledge-order MEET (greatest lower bound): observers that
// agree meet to their shared value; genuine disagreement (true vs false) meets to bottom -- the
// H^1 obstruction of the multi-observer network sheaf. One expensive conductor, many cheap players.

const FOUR = ["bottom", "true", "false", "top"];

function meetK(a, b) {
  if (a === b) return a;
  if (a === "bottom" || b === "bottom") return "bottom";
  if (a === "top") return b;
  if (b === "top") return a;
  return "bottom"; // {true, false} disagree -> no shared committed evidence
}

export default function delegating(task, results) {
  if (typeof task !== "string" || task.length === 0)
    throw new TypeError("delegating: task must be a non-empty string");
  if (!Array.isArray(results) || results.length === 0)
    throw new TypeError("delegating: results must be a non-empty array of subagent settlement values");
  for (const r of results)
    if (!FOUR.includes(r)) throw new TypeError(`delegating: each result must be one of ${FOUR.join(", ")}`);
  const consensus = results.reduce(meetK, "top"); // top is the meet-identity
  return { task, consensus, results };
}
