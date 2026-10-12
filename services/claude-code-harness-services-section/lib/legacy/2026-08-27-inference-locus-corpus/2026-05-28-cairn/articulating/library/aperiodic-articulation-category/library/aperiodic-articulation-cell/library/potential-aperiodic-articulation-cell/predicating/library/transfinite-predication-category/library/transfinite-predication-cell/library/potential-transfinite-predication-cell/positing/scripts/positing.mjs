// positing : (potential-transfinite-predication-cell, posit) -> potential-scott-continuous-posit-cell
//
// Commits a Scott-continuous claim: raises the cell's value from "bottom" by the knowledge-order
// join (joinK) with the posited evidence. FOUR = {bottom, true, false, top}. Crucially
// true joinK false = top: disagreeing evidence accumulates as contradiction-as-data, NOT a crash.

const FOUR = ["bottom", "true", "false", "top"];

// Knowledge order join: bottom is identity; equal stays; any disagreement among {true,false} or
// presence of top yields top.
export function joinK(a, b) {
  if (a === b) return a;
  if (a === "bottom") return b;
  if (b === "bottom") return a;
  return "top";
}

export default function positing(cell, posit) {
  if (!cell || cell.value !== "bottom")
    throw new TypeError('positing: input.value must be "bottom" (a potential predication-cell)');
  const v = posit?.value;
  if (!FOUR.includes(v))
    throw new TypeError(`positing: posit.value must be one of ${FOUR.join(", ")}`);
  return { ...cell, value: joinK(cell.value, v) };
}
