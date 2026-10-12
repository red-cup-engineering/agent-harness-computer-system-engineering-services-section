#!/usr/bin/env node
import { adoptConfigurationArgument } from "../src/configuration.mjs";

adoptConfigurationArgument(process.argv.slice(2));
const { admitNextHistoricalDemand } = await import("../src/historical-demands.mjs");

const result = admitNextHistoricalDemand();
process.stdout.write(JSON.stringify({
  disposition: result.disposition,
  historicalDemand: result.demand?.id ?? null,
  cycle: result.admitted?.cycle?.id ?? null,
  sourceReceipt: result.record?.sourceReceipt ?? null,
}, null, 2) + "\n");
