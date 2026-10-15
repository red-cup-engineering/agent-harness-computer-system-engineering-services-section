import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseConnectorCall, diagnoseOperationSet } from "../src/connector-call-evidence.mjs";

const base = {operation:"mcp__GitHub__create_pull_request",effect_kind:"write"};
test("unlocated connector internal exception cannot assert GitHub provider rejection or lost credentials",()=>{
 const o=diagnoseConnectorCall({...base,error_message:"The tool failed internally."});
 assert.equal(o.classification,"UNLOCATED_TOOL_FAILURE");
 assert.equal(o.provider_reachability,"UNKNOWN");
 assert.equal(o.provider_effect,"UNKNOWN");
 assert.equal(o.next,"READ_BACK_ORIGINAL_EFFECT_BEFORE_ANY_RETRY");
});
test("actual GitHub-originated HTTP failure needs confirmed provider dispatch and status",()=>{
 const o=diagnoseConnectorCall({...base,provider_reached:true,dispatch_observed:true,provider_status:422,error_message:"validation failed"});
 assert.equal(o.classification,"PROVIDER_HTTP_FAILURE");
 assert.equal(o.provider_reachability,"CONFIRMED");
 assert.equal(o.next,"READ_EXACT_PROVIDER_ERROR_AND_FIX_PROVIDER_PREREQUISITE");
});
test("host predispatch safety block stops exactly that mutation",()=>{
 const o=diagnoseConnectorCall({...base,dispatch_observed:false,provider_reached:false,host_safety_refusal:true,error_code:"CHATGPT_HARNESS_POLICY_BLOCK"});
 assert.equal(o.classification,"HOST_PREDISPATCH_SAFETY_REFUSAL");
 assert.equal(o.next,"HOLD_THIS_EFFECT_CONTINUE_INDEPENDENT_WORK");
 assert.equal(o.provider_reachability,"NOT_REACHED");
 assert.equal(o.provider_effect,"UNKNOWN");
});
test("a caller's assertion of safety refusal without host evidence cannot become a proven platform block",()=>{
 const o=diagnoseConnectorCall({...base,dispatch_observed:false,host_safety_refusal:true,error_message:"Some policy might block this"});
 assert.equal(o.classification,"UNLOCATED_TOOL_FAILURE");
});
test("advertised but unknown tool is routing problem only when proven before provider",()=>{
 const t={operation:"metroplat_world_connect",effect_kind:"read",error_message:"unknown tool: metroplat_world-connect",catalog_advertised:true,provider_reached:false};
 assert.equal(diagnoseConnectorCall(t).classification,"CONNECTOR_CATALOG_ROUTING");
 assert.equal(diagnoseConnectorCall({...t,provider_reached:undefined}).classification,"UNLOCATED_TOOL_FAILURE");
});
test("wrong supported argument schema is distinct from denied authorization",()=>{
 const o=diagnoseConnectorCall({...base,schema_rejected:true,dispatch_observed:false,provider_reached:false});
 assert.equal(o.classification,"CALLER_SCHEMA");
});
test("native actor outage after backend dispatch differs from all host/connector failures",()=>{
 const o=diagnoseConnectorCall({operation:"world-connect",effect_kind:"read",provider_reached:true,native_actor_unavailable:true,error_message:"native actor is not running"});
 assert.equal(o.classification,"NATIVE_ACTOR_UNAVAILABLE");
});
test("returned unknown internal error in Cold Red Gate read stays scoped to that verb",()=>{
 const names=["world-connect","lspace_search","compute_resources"];
 const obs=[diagnoseConnectorCall({operation:names[0],effect_kind:"read",error_message:"The tool failed internally."})];
 const s=diagnoseOperationSet(names,obs);
 assert.equal(s[names[0]],"UNLOCATED_TOOL_FAILURE");
 assert.equal(s[names[1]],"UNVERIFIED");
 assert.equal(s[names[2]],"UNVERIFIED");
});
test("same-time contradictory provider observations fail closed",()=>{
 const o=diagnoseConnectorCall({...base,provider_reached:true,provider_effect_observed:true,provider_effect_absent:true,effect_absence_witness_ref:"provider:absence"});
 assert.equal(o.classification,"CONTESTED_EVIDENCE");
 assert.equal(o.next,"RECONCILE_ORIGINAL_ATTEMPT");
});
test("provider effect absence is not inferred from a Boolean without independent witness",()=>{
 const o=diagnoseConnectorCall({...base,provider_effect_absent:true});
 assert.equal(o.provider_effect,"UNKNOWN");
 assert.match(o.evidence_issues.join(" " ),/absence lacks/);
});
test("provider effect observed still needs independent receiving",()=>{
 const o=diagnoseConnectorCall({...base,provider_reached:true,provider_effect_observed:true});
 assert.equal(o.classification,"PROVIDER_EFFECT_OBSERVED");
 assert.equal(o.next,"VERIFY_EXACT_RECEIVER_AND_REVISION");
});
test("a real host no-dispatch and real provider-reached claim are contradictory",()=>{
 const o=diagnoseConnectorCall({...base,provider_reached:true,dispatch_observed:false,host_safety_refusal:true,error_code:"CHATGPT_HARNESS_POLICY_BLOCK"});
 assert.equal(o.classification,"CONTESTED_EVIDENCE");
});
test("sibling operation success cannot mark a failed tool restored",()=>{
 const s=diagnoseOperationSet(["github.create_file","github.create_pull_request"],[
  {operation:"github.create_file",classification:"PROVIDER_EFFECT_OBSERVED"},
  {operation:"github.create_pull_request",classification:"HOST_PREDISPATCH_SAFETY_REFUSAL"}]);
 assert.equal(s["github.create_file"],"PROVIDER_EFFECT_OBSERVED");
 assert.equal(s["github.create_pull_request"],"HOST_PREDISPATCH_SAFETY_REFUSAL");
});
