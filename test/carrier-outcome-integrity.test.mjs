import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {agencyOutcomeSchema,readAgencyWorkOutcome} from '../src/carrier/agency-carrier.mjs';
const require=createRequire(import.meta.url);
const {skillSuccess,skillError}=await import(pathToFileURL(require.resolve('@red-cup-engineering/animating/becoming/doing/working/governing/skill')));
const {workResultFromSkillResult,admitAgencyWorkResult}=await import(pathToFileURL(require.resolve('@red-cup-engineering/organizing/work/schema')));
const {validateSchemaInstance}=await import(pathToFileURL(require.resolve('@red-cup-engineering/json-schema-services-section/validate-schema-instance')));
const scope='endeavor:carrier-contract-fixture';
test('a genuine native success remains the original admitted result',()=>{
 const original=workResultFromSkillResult(skillSuccess({output:'actual method output'}));
 const read=readAgencyWorkOutcome(JSON.stringify(original),scope);
 assert.deepEqual(read.result,admitAgencyWorkResult(original));assert.deepEqual(read.evidence,[]);
 assert.equal(validateSchemaInstance({instance:original,schema:agencyOutcomeSchema()}).ok,true);
});
test('a genuine native error remains an error with its original class and evidence',()=>{
 const original=workResultFromSkillResult(skillError('MissingInput','fixture has no input',scope));
 const read=readAgencyWorkOutcome(JSON.stringify(original),scope);
 assert.deepEqual(read.result,admitAgencyWorkResult(original));assert.deepEqual(read.evidence,[]);
 assert.equal(validateSchemaInstance({instance:original,schema:agencyOutcomeSchema()}).ok,true);
});
test('malformed completed output becomes a witnessed validation report without duplicating raw text',()=>{
 const raw='private-fixture-output is not JSON';const read=readAgencyWorkOutcome(raw,scope);
 assert.equal(read.result.kind,'skill-error');assert.equal(read.result.skillOutcome.error.errorClass,'ValidationFailure');
 assert.ok(!read.result.error.includes('private-fixture-output'));
 assert.deepEqual(read.evidence,['unadmitted-work-outcome-sha256:'+createHash('sha256').update(raw).digest('hex')]);
 assert.deepEqual(admitAgencyWorkResult(read.result),read.result);
});
test('missing output and nonclassical native success never become fulfilled work',()=>{
 const original=workResultFromSkillResult(skillSuccess({output:'original'}));
 for(const mutate of [x=>{delete x.skillOutcome.output},x=>{x.skillOutcome.reading='stable'},x=>{x.value={different:true}}]){
  const value=structuredClone(original);mutate(value);
  const read=readAgencyWorkOutcome(JSON.stringify(value),scope);
  assert.equal(read.result.kind,'skill-error');assert.equal(read.result.skillOutcome.error.errorClass,'ValidationFailure');
  assert.equal(read.evidence.length,1);assert.deepEqual(admitAgencyWorkResult(read.result),read.result);
 }
});
test('the provider schema rejects success/error mismatches and the observed missing/classical-reading defects',()=>{
 const original=workResultFromSkillResult(skillSuccess({output:'original'}));
 for(const mutate of [x=>{delete x.skillOutcome.output},x=>{x.skillOutcome.reading='stable'},x=>{delete x.value},x=>{x.kind='skill-error';x.error='a false wrapper'},x=>{x.skillOutcome.error={errorClass:'MissingInput',message:'wrong'};}]){
  const value=structuredClone(original);mutate(value);
  assert.equal(validateSchemaInstance({instance:value,schema:agencyOutcomeSchema()}).ok,false);
 }
});
test('legacy admitted terminal reports retain their original meaning',()=>{
 const original={kind:'skill-result',value:{legacy:true}};
 const read=readAgencyWorkOutcome(JSON.stringify(original),scope);
 assert.deepEqual(read.result,original);assert.deepEqual(read.evidence,[]);
});
