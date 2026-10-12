#!/usr/bin/env node
// UserPromptSubmit hook: compile a character store's context for the incoming prompt.
//   character-context-hook STORE   (reads the hook payload {prompt} on stdin; writes the context; always exits 0)
import { compileContext } from "../src/character-context.mjs";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
try {
  const store = process.argv[2];
  const { prompt } = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  if (store) process.stdout.write(compileContext(store, prompt));
} catch { /* never block a prompt */ }
process.exit(0);
