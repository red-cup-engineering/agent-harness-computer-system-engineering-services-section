import { jsonToTerm } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/json-codec";

export function hookEventClaimTerm(input) {
  return jsonToTerm(Object.freeze({
    kind: "metroplat.hook.claim",
    version: 1,
    harness: input.harness,
    hookEventName: input.hookEventName,
    ...(input.toolName === undefined ? {} : { toolName: input.toolName }),
  }));
}
