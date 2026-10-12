#!/usr/bin/env node
import{readFileSync}from"node:fs";import{projectAgentPlatform}from"../src/agent-platform.mjs";export{projectAgentPlatform};if(import.meta.main){const i=JSON.parse(readFileSync(0,"utf8"));process.stdout.write(`${JSON.stringify(projectAgentPlatform(i.sources,i.params,i.options))}\n`);}
