import { randomUUID } from "node:crypto";
import { Message, Role } from "@a2a-js/sdk";
import { a2aResultParts, sendRmnTask } from "@red-cup-engineering/a2a-rmn-task-client-service";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { ACTOR } from "./enterprise.mjs";
import { operationBytes, operationFromBytes } from "./a2a-executor.mjs";

const semanticId = (value) => identifyJsonSemanticContent({ objectKind: "rsc-quiescent.record", value, witnessRoot: EMPTY_WITNESS_ROOT }).token;
const identified = (body) => Object.freeze({ id: semanticId(body), ...body });

export async function observeCodexEnterprisePositionOverA2a({ agentCardUrl = process.env.CODEX_ENTERPRISE_AGENT_CARD_URL, send = sendRmnTask, signal } = {}) {
  if (typeof agentCardUrl !== "string" || !agentCardUrl) throw new TypeError("CODEX_ENTERPRISE_AGENT_CARD_URL is required");
  const operation = identified({ type: "CodexEnterprisePositionOperation", provider: ACTOR });
  const message = Message.toJSON({ messageId: randomUUID(), contextId: "", taskId: "", role: Role.ROLE_USER, parts: [rmnPart(operationBytes(operation))], metadata: {}, extensions: [], referenceTaskIds: [] });
  const exchange = await send({ agentUrl: agentCardUrl, message, requireSignature: true, signal });
  const response = operationFromBytes(extractRmnPart(a2aResultParts(exchange.result)).bytes);
  if (response?.type !== "CodexEnterprisePositionOperationResult" || response.provider !== ACTOR || response.request !== operation.id) throw new TypeError("Codex enterprise returned a foreign position result");
  return Object.freeze({ ...response.position, receipt: { inputNi: exchange.inputNi, outputNi: exchange.outputNi, agentCard: exchange.agentCard } });
}
