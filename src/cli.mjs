import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function isMain(moduleUrl, entryPath) {
  return Boolean(entryPath) && moduleUrl === pathToFileURL(realpathSync(resolve(entryPath))).href;
}
