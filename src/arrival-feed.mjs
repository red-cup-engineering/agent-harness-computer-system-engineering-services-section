import path from "node:path";

/** Whether a daily feed path is the hook catchment rather than a work feed. */
export function isArrivalLogPath(logPath) {
  return path.basename(String(logPath)).endsWith("-admit-arrival.jsonl");
}
