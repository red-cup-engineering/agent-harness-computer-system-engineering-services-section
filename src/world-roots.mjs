// world-roots — where the enterprise tree (and so the harness journals and carriers the world
// folds read) is, when this package is run in place rather than installed.
//
// The seeding and folding scripts used to walk up from their own file to a `.git` and throw at
// import time when there was none, which made them unimportable from an installed package (no
// `.git` above node_modules). Resolution is now: LAGOON_REPO_ROOT if declared, else the nearest
// `.git` above `startDir`, else null — and a null root only means the in-tree DEFAULT_* paths are
// absent; the verbs then require the caller to name roots, sources and trace explicitly.

import { existsSync } from "node:fs";
import path from "node:path";

export function findRepoRoot(startDir) {
  if (process.env.LAGOON_REPO_ROOT) return process.env.LAGOON_REPO_ROOT;
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
