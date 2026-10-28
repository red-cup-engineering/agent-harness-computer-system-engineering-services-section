import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {antigravityWorkspaces} from '../services/antigravity-harness-services-section/src/agency-work.mjs';
import {prepareCarrierWorktree} from '../src/carrier/workspace.mjs';
const root=fs.mkdtempSync(path.join(process.env.TEST_DATA_ROOT??tmpdir(),'antigravity-source-custody-'));
const environment={...process.env,METROPLAT_ANTIGRAVITY_WORKTREES:root+'/tasks'};
const item={requiresCapabilities:['work-board','work-open']};
const source=()=>({mode:'no-source',effects:'read-only'});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
test('Antigravity opens and removes actual private source-free scratch without invoking Git or installing',async()=>{
 const workspaces=antigravityWorkspaces({repository:'/not-a-repository',repositoryOf:source,environment,commandRunner:()=>assert.fail('No source command is permitted')});
 const spec={id:'assessment-original-taking',item,receiving:false};
 const opened=await workspaces.openWithSource(spec);
 assert.equal(fs.existsSync(opened.workspace),true);
 assert.equal(fs.existsSync(path.join(opened.workspace,'.git')),false);
 assert.deepEqual(fs.readdirSync(opened.workspace),[]);
 await workspaces.close({...spec,...opened,session:{ok:true}});
 assert.equal(fs.existsSync(opened.workspace),false);
});
test('source writing cannot start without the exact source candidate publisher',async()=>{
 const binding={id:'held-original-for-preflight'};
 const workspaces=antigravityWorkspaces({repositoryOf:()=>({repository:'/not-read',sourceBinding:binding}),environment,commandRunner:()=>assert.fail('Not before publisher admission')});
 await assert.rejects(workspaces.openWithSource({id:'bound-original-task',item:{requiresCapabilities:['duty-worktree-write']}}),/requires its bound candidate publisher before launch/);
});
test('the exact admitted source preparation reaches the original owner before any source command',async()=>{
 const binding={id:'held-original-for-preflight'},writing={requiresCapabilities:['duty-worktree-write']};
 const stop=new Error('trusted preparation observed');let observed;
 const workspaces=antigravityWorkspaces({repositoryOf:()=>({repository:'/not-read',sourceBinding:binding}),environment,publishSourceCandidate:()=>assert.fail('Not before preparation'),sourcePreparationOf:spec=>{observed=spec;throw stop},commandRunner:()=>assert.fail('Not before preparation')});
 await assert.rejects(workspaces.openWithSource({id:'bound-original-preparation',item:writing}),e=>e===stop);
 assert.equal(observed.sourceBinding,binding);assert.equal(observed.item,writing);
});
test('receiving cannot substitute an unproduced source result',async()=>{
 const workspaces=antigravityWorkspaces({repositoryOf:()=>({repository:'/not-read',sourceBinding:{id:'held'}}),environment,commandRunner:()=>assert.fail('No receiving result')});
 await assert.rejects(workspaces.openWithSource({id:'receiving-original',item,receiving:true}),/requires the witnessed named result/);
});
test('read-only preparation rejects dependency installation before any Git command',async()=>{
 await assert.rejects(prepareCarrierWorktree({name:'antigravity',label:'Antigravity'},{cwd:'/not-read',taskId:'read-only',effects:'read-only',install:true,environment,commandRunner:()=>assert.fail('No command')}),/cannot install dependencies/);
});
test('the actual selected writer prepares source without composing its unavailable gitlink or installing packages',async()=>{
 const repository=root+'/original';fs.mkdirSync(repository);
 const git=args=>execFileSync('git',['-C',repository,...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 git(['init','--initial-branch=main']);git(['config','user.email','native-receiving@example.invalid']);git(['config','user.name','Native source receiving']);
 fs.writeFileSync(repository+'/package.json','{"private":true,"scripts":{"postinstall":"exit 99"}}\n');
 fs.writeFileSync(repository+'/.gitmodules','[submodule "unavailable"]\npath = services/unavailable\nurl = file:///must-not-be-cloned\n');
 git(['add','package.json','.gitmodules']);git(['commit','-m','Original bounded source fixture']);
 const head=git(['rev-parse','HEAD']);git(['update-index','--add','--cacheinfo','160000,'+head+',services/unavailable']);git(['commit','-m','Explicit unavailable composition']);
 git(['remote','add','origin',repository]);
 const prepared=await prepareCarrierWorktree({name:'antigravity',label:'Antigravity'},{cwd:repository,taskId:'source-only-original',effects:'read-only',environment});
 assert.equal(fs.existsSync(prepared.workspace+'/package.json'),true);
 assert.equal(fs.existsSync(prepared.workspace+'/node_modules'),false);
 assert.equal(fs.existsSync(prepared.workspace+'/services/unavailable/.git'),false);
 git(['worktree','remove','--force',prepared.workspace]);
});
