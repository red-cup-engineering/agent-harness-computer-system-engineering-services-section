import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{tmpdir}from'node:os';import{execFileSync}from'node:child_process';import{antigravityDialect}from'../services/antigravity-harness-services-section/src/antigravity-session.mjs';
const root=fs.mkdtempSync(path.join(process.env.TEST_DATA_ROOT??tmpdir(),'carrier-model-selection-receiving-'));
const repository=root+'/original',cwd=root+'/work';
fs.mkdirSync(repository);
const git=arguments_=>execFileSync('git',['-C',repository,...arguments_],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
git(['init','--initial-branch=main']);git(['config','user.email','native-receiving@example.invalid']);git(['config','user.name','Native model receiving']);
fs.writeFileSync(repository+'/fixture.txt','Original bounded source\n');git(['add','fixture.txt']);git(['commit','-m','Original source fixture']);git(['worktree','add','--detach',cwd,'HEAD']);
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
const dialect=antigravityDialect;
const args=(model,reasoningEffort)=>dialect.startArguments({cwd,effects:'read-only',model,reasoningEffort});
const actualError='Antigravity ended ERROR: invalid model selection (--model "gemini-3.8-flash" --effort "medium"): --effort is not supported for model "gemini-3.8-flash"';
test('known Gemini catalogue aliases preserve requested effort without unsupported CLI flags',()=>{
 for(const model of ['gemini-3.8-flash','gemini-4-argon'])for(const effort of ['low','medium','high']){
  const argv=args(model,effort);assert.equal(argv[argv.indexOf('--model')+1],model+'-'+effort);assert.equal(argv.includes('--effort'),false);assert.equal(argv.includes('--sandbox'),true);
 }
 const resumed=dialect.resumeArguments({cwd,effects:'read-only',model:'gemini-3.8-flash',reasoningEffort:'medium',thread:'fixture:original-conversation'});
 assert.equal(resumed[resumed.indexOf('--model')+1],'gemini-3.8-flash-medium');assert.equal(resumed[resumed.indexOf('--conversation')+1],'fixture:original-conversation');
});
test('explicit aliases cannot be doubled, contradicted or silently given an unsupported effort',()=>{
 assert.equal(args('gemini-3.8-flash-medium','medium').filter(x=>x==='gemini-3.8-flash-medium').length,1);
 assert.throws(()=>args('gemini-3.8-flash-medium','high'),TypeError);
 assert.throws(()=>args('gemini-3.8-flash','xhigh'),TypeError);
 assert.throws(()=>args('gemini-4-argon','max'),TypeError);
});
test('legacy and unspecified selections retain their original argument behavior',()=>{
 const legacy=args('other-fixture-model','high');assert.equal(legacy[legacy.indexOf('--model')+1],'other-fixture-model');assert.equal(legacy[legacy.indexOf('--effort')+1],'high');
 assert.equal(args(undefined,undefined).includes('--model'),false);assert.equal(args('default',undefined).includes('--model'),false);assert.equal(args('gemini-3.8-flash',undefined)[args('gemini-3.8-flash',undefined).indexOf('--model')+1],'gemini-3.8-flash');
});
test('model and effort remain backend-log observations rather than requested alias attestations',()=>{
 fs.writeFileSync(root+'/events.jsonl',JSON.stringify({event:'result',result:{status:'SUCCESS',conversation_id:'fixture:observed-conversation',structured_output:{output:'fixture output'}}})+'\n');
 fs.writeFileSync(root+'/agy.log','I1028 00:00:00.000001 1 model.go:1] Propagating selected model override to backend: label="Gemini 3.8 Flash (Medium)"\n');
 const observed=dialect.readSession(root);assert.equal(observed.thread,'fixture:observed-conversation');assert.equal(observed.model,'gemini-3.8-flash');assert.equal(observed.reasoningEffort,'medium');
});
test('native AGY_ERROR retryability recovers transport failures while quota refusals remain terminal',()=>{
 const error='error: network issue\nAGY_ERROR: '+JSON.stringify({short_error:'dial tcp: DNS i/o timeout',retryable:true,status:'UNKNOWN',code_kind:'grpc',error_code:2});
 assert.equal(dialect.transient({ok:false,errors:[error]}),true);
 assert.equal(dialect.transient({ok:false,errors:['weekly quota exhausted',error]}),false);
 assert.equal(dialect.transient({ok:false,errors:['resource exhausted 429',error]}),false);
 assert.equal(dialect.transient({ok:true,errors:[error]}),false);
 for(const value of ['ordinary semantic error','arbitrary "retryable":true','AGY_ERROR: invalid json','AGY_ERROR: {"retryable":false}','AGY_ERROR: {"retryable":"true"}'])
  assert.equal(dialect.transient({ok:false,errors:[value]}),false,value);
});
test('unsupported-effort startup classification cannot reclassify an already observed session',()=>{
 assert.equal(dialect.startupFailure({ok:false,exitCode:3,errors:[actualError]}),true);
 assert.equal(dialect.startupFailure({ok:false,exitCode:3,thread:'fixture:started',errors:[actualError]}),false);
 assert.equal(dialect.startupFailure({ok:false,exitCode:3,errors:['a wrong engineering answer']}),false);
});
