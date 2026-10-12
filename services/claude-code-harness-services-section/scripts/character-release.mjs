#!/usr/bin/env node
// character-release STORE NOUN ["one-line annotation"]
import { releaseStore } from "../src/character-releases.mjs";

const [store, noun, annotation] = process.argv.slice(2);
try {
  if (!store || !noun) throw new Error("usage: character-release STORE NOUN [annotation]");
  const release = releaseStore(store, noun, annotation ? { annotation } : {});
  console.log(`Release ${release.version} prepared:\n  authors : ${release.authors.length ? release.authors.join(", ") : "(none — no commits in range)"}\n  commit  : ${release.commit}\n  record  : ${release.record}${release.index ? `\n  index   : ${release.index}` : ""}\n\nStage the record${release.index ? " and the index" : ""} and commit "release: ${release.version}".`);
} catch (error) { console.error(error.message); process.exit(1); }
