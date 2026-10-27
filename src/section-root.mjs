import { fileURLToPath } from "node:url";

/** The section root that owns this harness's data: the root of this package. */
export const SECTION_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** The section root an environment names (tests and deployments that keep a section elsewhere), else this package's. */
export const sectionRootOf = (environment = process.env) => environment.AGENT_HARNESS_SECTION_ROOT || SECTION_ROOT;
