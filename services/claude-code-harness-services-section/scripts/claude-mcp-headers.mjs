#!/usr/bin/env node
/**
 * Claude Code's `headersHelper` for a node's MetroPlat MCP server: prints the Authorization header
 * JSON of the harness character's own password sign-in.
 *
 *   claude-mcp-headers.mjs --url <mcp url> --agency-root <dir> --character <id> --credentials <claude-harness.env>
 *
 * The username is read from the character's `metroplat` sign-in organ in the agency records and
 * checked against the organ's account; the password is METROPLAT_SIGN_IN_PASSWORD in the host
 * credentials file the node renders (the caller names its path from `credentialPath`). The access
 * token is kept under XDG_RUNTIME_DIR until it expires. The cached token is answered before the
 * agency is read, so a connection with a live token starts in a few milliseconds.
 */
import { readFileSync } from "node:fs";
import { runMain } from "@red-cup-engineering/javascript-file-services-section/javascript-file-main-guard";
import { headersFor, parseEnvironmentFile, signInOf, tokenCache } from "../src/claude-sign-in.mjs";

const args = (argv) => {
  const values = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--") || argv[i + 1] === undefined) throw new Error(`unexpected argument ${argv[i]}`);
    values[argv[i].slice(2)] = argv[i + 1];
  }
  for (const required of ["url", "agency-root", "character", "credentials"]) if (!values[required]) throw new Error(`--${required} is required`);
  return values;
};

async function main() {
  const options = args(process.argv.slice(2));
  const cache = tokenCache({ runtimeDirectory: process.env.XDG_RUNTIME_DIR });
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID || undefined;
  const headers = await headersFor({
    mcpUrl: options.url, holder: options.character, cache, sessionId,
    username: async () => {
      // The agency reader is imported only when a sign-in needs the records.
      const { agencyAt } = await import("@red-cup-engineering/organizing/agency/held");
      const { resolve } = await import("@red-cup-engineering/organizing/agency");
      const agency = agencyAt(options["agency-root"]);
      const character = [...new Set(agency.characters.values())].find((c) => c.id === options.character);
      if (character === undefined) throw new Error(`the agency records no character ${options.character}`);
      return signInOf([...new Set(agency.organs.values())], character, {
        resolveCharacter: (of, organ) => resolve(agency, "characters", of, organ.sectionPath)?.id,
      }).username;
    },
    password: () => {
      const password = parseEnvironmentFile(readFileSync(options.credentials, "utf8")).METROPLAT_SIGN_IN_PASSWORD;
      if (!password) throw new Error(`${options.credentials} holds no METROPLAT_SIGN_IN_PASSWORD`);
      return password;
    },
  });
  process.stdout.write(`${JSON.stringify(headers)}\n`, () => process.exit(0));
}

// Only when run as the headersHelper; a probe links every claude-code export and must not run it.
await runMain(main, { moduleUrl: import.meta.url, formatError: (error) => `claude-mcp-headers: ${error.message}\n`, exitCode: 1 });
