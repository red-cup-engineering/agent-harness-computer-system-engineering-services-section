// Aggregates activity reports from multiple providers over a time window
// into a single combined report with summary metrics.
//
// A "provider" is any object with a `name` and a `collect({ window, recordedAt })`
// function that resolves to `{ events, stocks, unsupportedDomains }`. Providers
// are called independently: if one throws, its failure is recorded in the
// report's `responses` list and the rest of the report is still produced.

export const DOMAINS = Object.freeze([
  "formations", "politics", "contracts", "work", "a2a", "activity-streams",
  "git-io", "evm", "economy", "deployments", "operations",
]);

const COLONY_KIND_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

/**
 * The actor identity of one colony and of its report team, in the
 * `urn:ame:<colonyKind>` / `urn:ame:<colonyKind>:colony-report-team` shape
 * every colony in the union uses (compare `urn:ame:turntide-islands` and
 * `urn:ame:turntide-islands:colony-report-team`). The colony is a parameter:
 * no colony name is compiled into this owner.
 */
export function colonyActorIdentity(colonyKind) {
  if (typeof colonyKind !== "string" || !COLONY_KIND_PATTERN.test(colonyKind)) {
    throw new TypeError("colonyKind must be one lowercase hyphen-separated colony name");
  }
  return Object.freeze({
    colonyActor: `urn:ame:${colonyKind}`,
    colonyReportTeamActor: `urn:ame:${colonyKind}:colony-report-team`,
  });
}

const OUTCOMES = Object.freeze(["succeeded", "failed", "refused", "observed", "unknown"]);
const STOCK_STATUSES = Object.freeze(["observed", "stale", "unknown", "refused"]);
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

function isNonEmptyString(value, maxLength = 4096) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isDecimalString(value) {
  return isNonEmptyString(value, 128) && DECIMAL_PATTERN.test(value);
}

/**
 * Validates and normalizes a reporting window. `fromExclusive` and
 * `toInclusive` are ISO timestamps; the window covers the interval
 * (fromExclusive, toInclusive].
 */
export function reportingWindow({ fromExclusive, toInclusive }) {
  if (!isTimestamp(fromExclusive) || !isTimestamp(toInclusive) || Date.parse(fromExclusive) >= Date.parse(toInclusive)) {
    throw new TypeError("reporting window requires fromExclusive earlier than toInclusive, both parseable timestamps");
  }
  return { fromExclusive, toInclusive };
}

function normalizeQuantity(value) {
  if (!isNonEmptyString(value?.label) || !isDecimalString(value?.amount) || !isNonEmptyString(value?.unit)) {
    throw new TypeError("invalid quantity: expected { label, amount, unit }");
  }
  return { label: value.label, amount: value.amount, unit: value.unit };
}

function normalizeEvent(value, window) {
  if (!isNonEmptyString(value?.id) || !isTimestamp(value?.occurredAt)) {
    throw new TypeError("event needs a non-empty id and a valid occurredAt timestamp");
  }
  const occurredAt = Date.parse(value.occurredAt);
  if (occurredAt <= Date.parse(window.fromExclusive) || occurredAt > Date.parse(window.toInclusive)) {
    throw new TypeError(`event "${value.id}" occurred outside the reporting window`);
  }
  if (!DOMAINS.includes(value.domain)) throw new TypeError(`event "${value.id}" has an unknown domain: ${value.domain}`);
  if (!isNonEmptyString(value.kind) || !isNonEmptyString(value.summary)) throw new TypeError(`event "${value.id}" needs a kind and a summary`);
  if (!OUTCOMES.includes(value.outcome)) throw new TypeError(`event "${value.id}" has an unknown outcome: ${value.outcome}`);
  const evidence = value.evidence ?? [];
  if (!Array.isArray(evidence) || !evidence.every((item) => isNonEmptyString(item))) throw new TypeError(`event "${value.id}" has invalid evidence`);
  return {
    id: value.id,
    occurredAt: value.occurredAt,
    domain: value.domain,
    kind: value.kind,
    summary: value.summary,
    outcome: value.outcome,
    evidence,
    quantities: (value.quantities ?? []).map(normalizeQuantity),
  };
}

function normalizeStock(value, window) {
  if (!isNonEmptyString(value?.id) || !isTimestamp(value?.observedAt) || Date.parse(value.observedAt) > Date.parse(window.toInclusive)) {
    throw new TypeError("stock needs a non-empty id and an observedAt timestamp within the window");
  }
  if (!DOMAINS.includes(value.domain)) throw new TypeError(`stock "${value.id}" has an unknown domain: ${value.domain}`);
  if (!isNonEmptyString(value.label) || !isDecimalString(value.amount) || !isNonEmptyString(value.unit)) throw new TypeError(`stock "${value.id}" needs a label, a decimal amount, and a unit`);
  if (!STOCK_STATUSES.includes(value.status)) throw new TypeError(`stock "${value.id}" has an unknown status: ${value.status}`);
  return {
    id: value.id,
    observedAt: value.observedAt,
    domain: value.domain,
    label: value.label,
    amount: value.amount,
    unit: value.unit,
    status: value.status,
  };
}

function normalizeEnvelope(value, window) {
  if (value === null || typeof value !== "object") throw new TypeError("provider must resolve to an object with events and stocks");
  const events = (value.events ?? []).map((event) => normalizeEvent(event, window));
  const stocks = (value.stocks ?? []).map((stock) => normalizeStock(stock, window));
  const unsupportedDomains = [...new Set(value.unsupportedDomains ?? [])];
  if (!unsupportedDomains.every((domain) => DOMAINS.includes(domain))) throw new TypeError("unsupportedDomains names an unknown domain");
  return { events, stocks, unsupportedDomains };
}

/** Sums an array of exact decimal strings without floating-point error. */
export function sumDecimals(values) {
  const parsed = values.map((value) => {
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/u, "").split(".");
    return { negative, whole, fraction };
  });
  const scale = Math.max(0, ...parsed.map((value) => value.fraction.length));
  const total = parsed.reduce(
    (sum, value) => sum + (value.negative ? -1n : 1n) * BigInt(`${value.whole}${value.fraction.padEnd(scale, "0")}`),
    0n,
  );
  const sign = total < 0n ? "-" : "";
  const absolute = (total < 0n ? -total : total).toString().padStart(scale + 1, "0");
  if (!scale) return `${sign}${absolute}`;
  const fraction = absolute.slice(-scale).replace(/0+$/u, "");
  return `${sign}${absolute.slice(0, -scale)}${fraction ? `.${fraction}` : ""}`;
}

function metric(id, label, amount, unit, extra = {}) {
  return { id, label, amount: String(amount), unit, ...extra };
}

/**
 * Calls each provider for the given window, tolerating individual failures,
 * and returns a combined report: normalized events and stocks, a per-provider
 * response log, and summary metrics.
 */
export async function collectColonyReport({ window: rawWindow, recordedAt, providers }) {
  const window = reportingWindow(rawWindow);
  if (!isTimestamp(recordedAt)) throw new TypeError("recordedAt must be a valid timestamp");
  if (!Array.isArray(providers)) throw new TypeError("providers must be an array");
  const names = providers.map((provider) => provider?.name);
  if (new Set(names).size !== names.length) throw new TypeError("provider names must be unique");

  const responses = [];
  for (const provider of providers) {
    if (!isNonEmptyString(provider?.name) || typeof provider.collect !== "function") {
      throw new TypeError("each provider needs a name and a collect() function");
    }
    try {
      const raw = await provider.collect({ window, recordedAt });
      const { events, stocks, unsupportedDomains } = normalizeEnvelope(raw, window);
      responses.push({ status: "ok", name: provider.name, events, stocks, unsupportedDomains });
    } catch (error) {
      responses.push({ status: "error", name: provider.name, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  const ok = responses.filter((response) => response.status === "ok");
  const events = ok.flatMap((response) => response.events.map((event) => ({ ...event, provider: response.name })));
  const stocks = ok.flatMap((response) => response.stocks.map((stock) => ({ ...stock, provider: response.name })));

  const metrics = [metric("events-total", "Events reported", events.length, "events")];
  for (const domain of DOMAINS) {
    metrics.push(metric(`events-by-domain/${domain}`, `${domain} events`, events.filter((event) => event.domain === domain).length, "events"));
  }
  for (const outcome of OUTCOMES) {
    metrics.push(metric(`events-by-outcome/${outcome}`, `${outcome} outcomes`, events.filter((event) => event.outcome === outcome).length, "events"));
  }
  metrics.push(metric("providers-ok", "Providers that reported", ok.length, "providers"));
  metrics.push(metric("providers-failed", "Providers that failed", responses.length - ok.length, "providers"));
  metrics.push(metric("domains-with-activity", "Domains with at least one event", new Set(events.map((event) => event.domain)).size, "domains"));

  const quantityGroups = new Map();
  for (const event of events) {
    for (const quantity of event.quantities) {
      const key = `${event.provider} ${quantity.label} ${quantity.unit}`;
      const group = quantityGroups.get(key) ?? { provider: event.provider, label: quantity.label, unit: quantity.unit, amounts: [] };
      group.amounts.push(quantity.amount);
      quantityGroups.set(key, group);
    }
  }
  for (const group of quantityGroups.values()) {
    metrics.push(metric(`quantity/${group.provider}/${group.label}`, group.label, sumDecimals(group.amounts), group.unit, { provider: group.provider }));
  }
  for (const stock of stocks) {
    metrics.push(metric(`stock/${stock.provider}/${stock.id}`, stock.label, stock.amount, stock.unit, { provider: stock.provider, observedAt: stock.observedAt, status: stock.status }));
  }

  return {
    window,
    recordedAt,
    responses,
    events,
    stocks,
    metrics,
    coverage: { providers: providers.length, ok: ok.length, failed: responses.length - ok.length },
  };
}
