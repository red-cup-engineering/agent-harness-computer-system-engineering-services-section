#!/usr/bin/env node
import{readFileSync}from"node:fs";import{projectAgentSessionSummary}from"../src/session-summary.mjs";export{projectAgentSessionSummary};if(import.meta.main){const i=JSON.parse(readFileSync(0,"utf8"));process.stdout.write(`${JSON.stringify(projectAgentSessionSummary(i.sources,i.params,i.options))}\n`);}
