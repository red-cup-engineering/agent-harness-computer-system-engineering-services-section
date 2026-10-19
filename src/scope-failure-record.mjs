/**
 * The record of a scope that would not start. The host-resource hook places each command in a transient systemd scope of the
 * work slice and, when the user manager cannot start one ("Failed to start transient scope unit: Transport endpoint is not
 * connected"), runs the command unscoped. That fall-back used to leave nothing: the manager's own words were discarded and so was
 * the state it was in (here, an uninterruptible `D` state under a memory.high throttle). This entry keeps both:
 *
 *   node scope-failure-record.mjs <file holding systemd-run's standard error> <its exit status>
 *
 * It reads, without waiting on anything, the bus socket, the manager's cgroup (memory.high, memory.current, memory.max,
 * memory.events, pids.current, the processes in it with their state letters), the host's memory pressure and available memory; an
 * unreadable value is recorded as unreadable with its reason, never as healthy. The record is an OTLP log record in the SEAVT
 * telemetry store when that is installed, else one JSON line in `scope-failures.jsonl` beside it. The hook itself keeps its zero
 * dependencies: only this separate entry, run only on the failure path, loads them.
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE_BYTES_MAX = 1 << 20;
const PROCESSES_MAX = 16;

const unreadable = (error) => ({ unreadable: error?.code ?? String(error?.message ?? error) });
const attempt = (read) => { try { return read(); } catch (error) { return unreadable(error); } };
const text = (file) => attempt(() => readFileSync(file, "utf8").trim());
const count = (value) => (typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : value);
const keyed = (value) => (typeof value === "string" ? Object.fromEntries(value.split("\n").map((line) => line.trim().split(/\s+/u)).filter((parts) => parts.length === 2).map(([key, number]) => [key, count(number)])) : value);

/** The state letter and name of a process, from `<proc>/<pid>/stat`: `4242 (systemd) D 1 ...`. */
function processState(proc, pid) {
  return attempt(() => {
    const line = readFileSync(path.join(proc, String(pid), "stat"), "utf8");
    const open = line.indexOf("("), close = line.lastIndexOf(")");
    return { pid, comm: line.slice(open + 1, close), state: line.slice(close + 2, close + 3) };
  });
}

/**
 * The user manager's state as plain data. `proc` and `cgroup` are the file systems read (injectable for a fixture); `uid` the user whose manager it is.
 * Every key is present: a value that could not be read is `{unreadable: reason}`.
 */
export function userManagerState({ env = process.env, proc = "/proc", cgroup = "/sys/fs/cgroup", uid = process.getuid?.() } = {}) {
  const service = path.join(cgroup, "user.slice", `user-${uid}.slice`, `user@${uid}.service`);
  const bus = env.XDG_RUNTIME_DIR ? attempt(() => ({ path: path.join(env.XDG_RUNTIME_DIR, "bus"), socket: statSync(path.join(env.XDG_RUNTIME_DIR, "bus")).isSocket() })) : { unreadable: "XDG_RUNTIME_DIR unset" };
  // the manager itself runs in init.scope of its service cgroup; the service cgroup's own procs hold only what systemd left there
  const own = text(path.join(service, "init.scope", "cgroup.procs"));
  const procs = typeof own === "string" && own !== "" ? own : text(path.join(service, "cgroup.procs"));
  const pids = typeof procs === "string" ? procs.split("\n").filter((line) => /^\d+$/u.test(line)).map(Number) : [];
  const processes = pids.slice(0, PROCESSES_MAX).map((pid) => processState(proc, pid));
  const manager = processes.find((item) => item.comm === "systemd");
  const pressure = text(path.join(proc, "pressure", "memory"));
  const meminfo = text(path.join(proc, "meminfo"));
  const available = typeof meminfo === "string" ? /^MemAvailable:\s+(\d+) kB$/mu.exec(meminfo)?.[1] : undefined;
  return {
    bus,
    manager: manager ? { pid: manager.pid, state: manager.state } : { unreadable: typeof procs === "string" ? "no systemd process in the manager's cgroup" : procs.unreadable },
    cgroup: {
      path: service, "memory.high": count(text(path.join(service, "memory.high"))), "memory.current": count(text(path.join(service, "memory.current"))), "memory.max": count(text(path.join(service, "memory.max"))),
      "memory.events": keyed(text(path.join(service, "memory.events"))), "pids.current": count(text(path.join(service, "pids.current"))), processes: typeof procs === "string" ? { listed: processes.length, of: pids.length, items: processes } : procs,
    },
    pressure: { memory: typeof pressure === "string" ? pressure.split("\n")[0] : pressure },
    memory: { availableKiB: available === undefined ? { unreadable: typeof meminfo === "string" ? "no MemAvailable" : meminfo.unreadable } : Number(available) },
  };
}

const stateRoot = (env) => env.AGENT_HARNESS_TELEMETRY_ROOT || path.join(env.XDG_STATE_HOME || path.join(homedir(), ".local", "state"), "561-group", "agent-harness");

/**
 * Keep the failure. Returns `{stored: "telemetry", address}` or `{stored: "jsonl", file}`. `load` imports the telemetry module
 * (injectable); a load or write that fails falls back to the JSON line, and that to a thrown error for the caller to swallow.
 */
export async function recordScopeFailure({ errorFile, status, env = process.env, state = userManagerState({ env }), now = () => new Date().toISOString(), load = () => import("@red-cup-engineering/semiotic-eavt-services-section/telemetry") } = {}) {
  const said = attempt(() => { const bytes = readFileSync(errorFile); return bytes.subarray(0, FILE_BYTES_MAX).toString("utf8"); });
  const stderr = typeof said === "string" ? said : `(systemd-run's output was unreadable: ${said.unreadable})`;
  const exit = Number.isInteger(Number(status)) ? Number(status) : null;
  const root = stateRoot(env);
  const slice = "agent-work.slice";
  try {
    const { openTelemetry, systemPorts } = await load();
    const handle = openTelemetry({ root, channel: "containment", ports: systemPorts(env), service: { name: "agent-harness", namespace: "561-group", instanceId: hostname() } });
    const recorded = handle.recordCommand({
      operation: "agent-harness.containment", command: "systemd-run", args: ["--user", "--scope", "--quiet", "--collect", `--slice=${slice}`, "--", "bash", "-c", "<command>"],
      result: { status: exit, signal: null, stdout: "", stderr },
      attributes: { "semioverse.containment.slice": slice, "semioverse.containment.fallback": "the command ran unscoped", "semioverse.user_manager": state },
    });
    return { stored: "telemetry", address: recorded.address };
  } catch (cause) {
    const file = path.join(root, "scope-failures.jsonl");
    mkdirSync(root, { recursive: true });
    appendFileSync(file, `${JSON.stringify({ type: "AgentHarnessScopeFailure", at: now(), exitStatus: exit, stderr, userManager: state, fallbackReason: String(cause?.message ?? cause) })}\n`);
    return { stored: "jsonl", file };
  }
}

const invoked = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  try { await recordScopeFailure({ errorFile: process.argv[2], status: process.argv[3] }); } catch { /* the hook never fails because a record could not be kept */ }
}
