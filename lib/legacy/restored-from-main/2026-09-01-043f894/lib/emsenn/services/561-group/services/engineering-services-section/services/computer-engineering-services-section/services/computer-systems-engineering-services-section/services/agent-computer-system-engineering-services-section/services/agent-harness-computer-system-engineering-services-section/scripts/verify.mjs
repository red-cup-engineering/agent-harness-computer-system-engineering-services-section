import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sectionRoot = fileURLToPath(new URL("../", import.meta.url));
const packages = [
  "services/agent-message-journal-projection-service",
  "services/agent-operation-topology-projection-service",
  "services/agent-session-finding-projection-service",
  "services/agent-session-reading-projection-service",
  "services/harness-lifecycle-journal-service",
  "services/mape-k-actuation-office-service",
  "services/receiver-owned-tool-agent-service",
  "services/session-transcript-dialects-service",
  "services/codex-harness-services-section/services/codex-actuator-client-service",
  "services/codex-harness-services-section/services/codex-harness-projection-service",
  "services/codex-harness-services-section/services/codex-office-agent-projection-service",
  "services/claude-code-harness-services-section/services/claude-harness-projection-service",
];

for (const packagePath of packages) {
  console.log(`\n==> ${packagePath}`);
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "verify"], {
    cwd: `${sectionRoot}/${packagePath}`,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`\nVerified ${packages.length} maintained agent-harness packages.`);
