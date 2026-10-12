#!/usr/bin/env node
import{readFileSync}from"node:fs";import{projectStrategyEnactment}from"../src/strategy-enactment.mjs";export{projectStrategyEnactment};if(import.meta.main){const i=JSON.parse(readFileSync(0,"utf8"));process.stdout.write(`${JSON.stringify(projectStrategyEnactment(i.declaration,i.params,i.options))}\n`);}
