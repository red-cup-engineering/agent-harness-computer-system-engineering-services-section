#!/usr/bin/env node
// One command face over the shared harness lifecycle journal. Every harness
// uses it; which harness is recording is the explicit --actor argument (or
// HARNESS_LIFECYCLE_ACTOR), and where the journal lives is the explicit --root
// argument. Nothing here binds one machine or one provider.
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import {
  acknowledgeCoordination,
  completeCoordination,
  recordCoordinationCommission,
  recordProviderCommission,
  recordSkillSelection,
  refuseCoordination,
  summarizeHarnessLifecycle,
} from "../src/harness-lifecycle.mjs";
import { projectOpsHarnessAttentionEvents } from "../src/ops-attention-events.mjs";

const USAGE = "usage: harness-lifecycle-cli.mjs --root DIR --actor ACTOR <command>\n"
  + "  commission --turn ID --receiver ACTOR --capability NAME --channel NAME --work-class CLASS --allocation-bps N --input-refs REF[,REF] --route ROUTE --receiver-condition TEXT\n"
  + "  acknowledge --turn ID --coordination NI | complete --turn ID --coordination NI --input-refs REF[,REF] | refuse --turn ID --coordination NI --refusal TEXT\n"
  + "  record-skill --turn ID --skill NAME | record-agent --turn ID --agent NAME --task TEXT\n"
  + "  summary | project-ops-adapter --source LABEL";

function requiredArgument(name, args, environmentVariable) {
  const value = argument(name, args) ?? (environmentVariable ? process.env[environmentVariable] : undefined);
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} is required`);
  return value.trim();
}

try {
  const [command, ...args] = process.argv.slice(2);
  const root = requiredArgument("--root", args, "HARNESS_LIFECYCLE_ROOT");
  const inputs = argument("--input-refs", args)?.split(",").filter(Boolean);
  const actorCommands = new Set(["record-skill", "record-agent", "commission", "acknowledge", "complete", "refuse"]);
  const actor = actorCommands.has(command) ? requiredArgument("--actor", args, "HARNESS_LIFECYCLE_ACTOR") : undefined;
  const turnId = actorCommands.has(command) ? requiredArgument("--turn", args) : undefined;
  const result = command === "record-skill" ? recordSkillSelection({ root, actor, turnId, skill: requiredArgument("--skill", args) })
    : command === "record-agent" ? recordProviderCommission({ root, actor, turnId, agent: requiredArgument("--agent", args), task: argument("--task", args) })
      : command === "commission" ? recordCoordinationCommission({ root, actor, turnId, receiverActor: requiredArgument("--receiver", args), capability: requiredArgument("--capability", args), channel: requiredArgument("--channel", args), workClass: requiredArgument("--work-class", args), allocationBasisPoints: Number(requiredArgument("--allocation-bps", args)), inputRefs: inputs, route: requiredArgument("--route", args), receiverCondition: requiredArgument("--receiver-condition", args) })
        : command === "acknowledge" ? acknowledgeCoordination({ root, actor, turnId, coordination: requiredArgument("--coordination", args) })
          : command === "complete" ? completeCoordination({ root, actor, turnId, coordination: requiredArgument("--coordination", args), resultRefs: inputs })
            : command === "refuse" ? refuseCoordination({ root, actor, turnId, coordination: requiredArgument("--coordination", args), refusal: requiredArgument("--refusal", args) })
              : command === "summary" ? summarizeHarnessLifecycle({ root })
                : command === "project-ops-adapter" ? projectOpsHarnessAttentionEvents({ root, source: requiredArgument("--source", args), actor: argument("--actor", args) })
                  : undefined;
  if (result === undefined) throw new Error(USAGE);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`harness-lifecycle: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
