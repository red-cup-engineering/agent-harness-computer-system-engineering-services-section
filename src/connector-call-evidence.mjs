// Per-operation failure evidence. This is a diagnostic, not an actuator, permission,
// platform-safety override, deployment receipt, or excuse to abandon other work.
const nonempty = v => typeof v === "string" && v.trim().length > 0;
const bool = v => v === true;
const hostMessage = m => typeof m === "string" &&
  (/blocked by OpenAI.*safety checks/i.test(m) ||
   /couldn.t determine the safety status of the request/i.test(m));
const hostCode = c => c === "CHATGPT_HARNESS_POLICY_BLOCK" ||
  c === "OPENAI_PREDISPATCH_SAFETY";
const catalogError = (c,m) => c === "UNKNOWN_TOOL" ||
  (typeof m === "string" && /^unknown tool(?::|\s)/i.test(m));

/**
 * Read a single tool call's evidence. Never infer whether the remote provider
 * saw a request from the English text of an internal connector exception.
 * The caller must obtain dispatch and effect evidence from the actual issuer.
 */
export function diagnoseConnectorCall(x = {}) {
  if (!nonempty(x.operation) || !["read","write"].includes(x.effect_kind))
    throw new TypeError("exact operation and read/write effect kind required");
  const reached = bool(x.provider_reached), undispatched = x.dispatch_observed === false;
  const observed = bool(x.provider_effect_observed);
  const absentWitness = bool(x.provider_effect_absent) &&
    nonempty(x.effect_absence_witness_ref);
  const safety = hostCode(x.error_code) || hostMessage(x.error_message);
  const refusal = bool(x.host_safety_refusal) && safety;
  const errors = [];
  if (observed && absentWitness) errors.push("contradictory provider effect observations");
  if (reached && undispatched) errors.push("provider reached despite explicit no-dispatch");
  if (refusal && reached) errors.push("predispatch refusal conflicts with provider-reached evidence");
  if (x.provider_reached === false && x.dispatch_observed === true)
    errors.push("dispatch and provider boundary need reconciliation");
  if (bool(x.provider_effect_absent) && !absentWitness)
    errors.push("effect absence lacks an independent readback witness");
  let classification, next;
  if (errors.some(e => !e.startsWith("effect absence"))) {
    classification = "CONTESTED_EVIDENCE";
    next = "RECONCILE_ORIGINAL_ATTEMPT";
  } else if (observed) {
    classification = "PROVIDER_EFFECT_OBSERVED";
    next = "VERIFY_EXACT_RECEIVER_AND_REVISION";
  } else if (refusal && undispatched && x.provider_reached !== true) {
    classification = "HOST_PREDISPATCH_SAFETY_REFUSAL";
    next = "HOLD_THIS_EFFECT_CONTINUE_INDEPENDENT_WORK";
  } else if (catalogError(x.error_code,x.error_message) &&
             bool(x.catalog_advertised) && x.provider_reached === false) {
    classification = "CONNECTOR_CATALOG_ROUTING";
    next = "RECONCILE_SERVER_AND_CLIENT_TOOL_DESCRIPTORS";
  } else if (bool(x.schema_rejected) && undispatched) {
    classification = "CALLER_SCHEMA";
    next = "REPAIR_ARGUMENTS_TO_DECLARED_SCHEMA";
  } else if (reached && Number.isInteger(x.provider_status) && x.provider_status >= 400) {
    classification = "PROVIDER_HTTP_FAILURE";
    next = "READ_EXACT_PROVIDER_ERROR_AND_FIX_PROVIDER_PREREQUISITE";
  } else if (reached && bool(x.native_actor_unavailable)) {
    classification = "NATIVE_ACTOR_UNAVAILABLE";
    next = "REPAIR_NATIVE_RUNTIME_AND_VERIFY_OPERATION";
  } else {
    classification = "UNLOCATED_TOOL_FAILURE";
    next = x.effect_kind === "write"
      ? "READ_BACK_ORIGINAL_EFFECT_BEFORE_ANY_RETRY"
      : "CHECK_OPERATION_SCOPED_CONNECTOR_AND_RUNTIME_EVIDENCE";
  }
  return Object.freeze({
    operation: x.operation,
    effect_kind: x.effect_kind,
    classification, next,
    provider_reachability: reached ? "CONFIRMED" :
      x.provider_reached === false && undispatched ? "NOT_REACHED" : "UNKNOWN",
    provider_effect: observed ? "OBSERVED" : absentWitness ? "ABSENT_WITH_WITNESS" : "UNKNOWN",
    evidence_issues: Object.freeze(errors)
  });
}

/** A sibling's green check does not prove this operation was ever callable. */
export function diagnoseOperationSet(required, observations) {
  if (!Array.isArray(required) || !Array.isArray(observations))
    throw new TypeError("operation sets must be arrays");
  const names = [...new Set(required)];
  if (names.some(n => !nonempty(n))) throw new TypeError("nonblank operation names required");
  const result = Object.fromEntries(names.map(name => {
    const own = observations.filter(o=>o?.operation===name);
    if (own.length===0) return [name,"UNVERIFIED"];
    const statuses = [...new Set(own.map(o=>o.classification))];
    return [name,statuses.length===1 ? statuses[0] : "CONTESTED_OBSERVATIONS"];
  }));
  return Object.freeze(result);
}
