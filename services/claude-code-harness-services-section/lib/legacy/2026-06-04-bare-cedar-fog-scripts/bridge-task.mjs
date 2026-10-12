#!/usr/bin/env node
import { payloadFromText, readStdin, recordDevEvent } from "./dev-runtime.mjs";

try {
  await recordDevEvent("dev.bare-cedar-fog.emsenn.net.bridge-task", payloadFromText(await readStdin()));
} catch {
  process.exitCode = 0;
}
