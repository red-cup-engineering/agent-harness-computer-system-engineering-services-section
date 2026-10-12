// Saves a collected colony report to disk as a timestamped JSON file in a
// caller-named directory, and reads the most recently saved one back. This
// is the one single filesystem effect around collectColonyReport(): it
// lives in scripts/, alongside default-colony-report.mjs's pure
// ColonyCivicIntervalReport projection in src/, and reaches every effect
// through the house effect owners -- make-directory-service,
// file-services, resolve-filepath-service, and path-walking-service --
// rather than node:fs/node:path directly.
import { makeDirectory } from "@red-cup-engineering/make-directory-service";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { writeFileText } from "@red-cup-engineering/file-services/write-file";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { walkPosixPaths } from "@red-cup-engineering/path-walking-service";
import { collectColonyReport } from "../src/colony-report.mjs";

function reportDirectory(dir) {
  if (typeof dir !== "string" || dir.length === 0) {
    throw new TypeError("a report directory path is required: this service writes only where the caller names");
  }
  return dir;
}

function fileNameFor(recordedAt) {
  return `${recordedAt.replace(/[:.]/gu, "-")}.json`;
}

/** Collects a report and writes it to `dir` as a timestamped JSON file. */
export async function collectAndSaveColonyReport({ window, recordedAt, providers = [], dir }) {
  const directory = reportDirectory(dir);
  const report = await collectColonyReport({ window, recordedAt, providers });
  await makeDirectory({ path: directory });
  await writeFileText(resolveFilepath([directory, fileNameFor(report.recordedAt)]), JSON.stringify(report, null, 2));
  return report;
}

/** Reads the most recently saved report from `dir`, or null if there is none. */
export async function readLatestColonyReport({ dir } = {}) {
  const directory = reportDirectory(dir);
  const walk = await walkPosixPaths({ root: directory, maxDepth: 0, missing: "empty" });
  const reportFiles = walk.files.map(({ path }) => path).filter((name) => name.endsWith(".json")).sort();
  if (reportFiles.length === 0) return null;
  const contents = await readFileText(resolveFilepath([directory, reportFiles.at(-1)]));
  return JSON.parse(contents);
}
