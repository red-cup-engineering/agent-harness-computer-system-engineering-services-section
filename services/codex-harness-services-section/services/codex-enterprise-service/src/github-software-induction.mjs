const SENDER_CONFIGURATION = Object.freeze([
  "ACTIVITYPUB_ORIGIN",
  "ACTIVITYPUB_IDENTIFIER",
  "ACTIVITYPUB_KEYS_PATH",
  "ACTIVITYPUB_A2A_AGENT_CARD",
]);
const PROVIDER_CONFIGURATION = Object.freeze([
  "GITHUB_SOFTWARE_INDUCTION_ACTIVITYPUB_ACTOR",
  "GITHUB_SOFTWARE_INDUCTION_ACTIVITYPUB_INBOX",
]);
const REQUIRED_CONFIGURATION = Object.freeze([...SENDER_CONFIGURATION, ...PROVIDER_CONFIGURATION]);

function configured(environment, name) {
  return typeof environment?.[name] === "string" && environment[name].trim() !== "";
}

export function githubSoftwareInductionReadiness({ environment = process.env } = {}) {
  const present = REQUIRED_CONFIGURATION.filter((name) => configured(environment, name));
  const missing = REQUIRED_CONFIGURATION.filter((name) => !configured(environment, name));
  return Object.freeze({
    ready: missing.length === 0,
    sender: Object.freeze({ present: SENDER_CONFIGURATION.filter((name) => present.includes(name)), missing: SENDER_CONFIGURATION.filter((name) => missing.includes(name)) }),
    provider: Object.freeze({ present: PROVIDER_CONFIGURATION.filter((name) => present.includes(name)), missing: PROVIDER_CONFIGURATION.filter((name) => missing.includes(name)) }),
  });
}

async function unboundSovereignClient() {
  throw new Error("github software induction requires an explicitly bound induceGithubSoftwareProposal capability");
}

export function createGithubSoftwareInductionCarrier({ environment = process.env, loader = unboundSovereignClient, deliver } = {}) {
  async function submit({ proposal, confirmExternalMutation } = {}) {
    if (confirmExternalMutation !== true) throw new TypeError("github software induction requires confirmExternalMutation: true");
    if (proposal === null || typeof proposal !== "object" || Array.isArray(proposal)) throw new TypeError("github software induction requires an object proposal");
    const readiness = githubSoftwareInductionReadiness({ environment });
    if (!readiness.ready) throw new Error(`github software induction is not configured; missing: ${[...readiness.sender.missing, ...readiness.provider.missing].join(", ")}`);
    const client = await loader();
    if (typeof client?.induceGithubSoftwareProposal !== "function") throw new TypeError("github software induction sovereign client is unavailable");
    const options = {
      origin: environment.ACTIVITYPUB_ORIGIN,
      identifier: environment.ACTIVITYPUB_IDENTIFIER,
      keyPath: environment.ACTIVITYPUB_KEYS_PATH,
      agentCard: environment.ACTIVITYPUB_A2A_AGENT_CARD,
      recipient: environment.GITHUB_SOFTWARE_INDUCTION_ACTIVITYPUB_ACTOR,
      inbox: environment.GITHUB_SOFTWARE_INDUCTION_ACTIVITYPUB_INBOX,
      ...(deliver === undefined ? {} : { deliver }),
    };
    return client.induceGithubSoftwareProposal(proposal, options);
  }
  return Object.freeze({ observeReadiness: () => githubSoftwareInductionReadiness({ environment }), submit });
}
