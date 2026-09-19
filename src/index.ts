import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

const execFileAsync = promisify(execFile);

export const name = "alwayswork";
export const inject = ["tools"];

/**
 * Two ways to reach the node, chosen automatically:
 *
 *  - INSIDE THE WORKLOAD CONTAINER (the standard, SYSTEM_SPEC §12): there is
 *    no `aw` binary. The agent shares its workspace directory with us; the
 *    channel is files under /workspace/.alwayswork (objectives from the
 *    control plane, requests to the host bridge, results back). The bridge
 *    serves an allowlisted set of operations — never a command line.
 *  - ON THE HOST (legacy `mode: host`): `aw` is on PATH and the tools shell
 *    out to it exactly as before.
 */
const AW = process.env.ALWAYSWORK_AW_BIN ?? "aw";
const ROOT = process.env.ALWAYSWORK_WORKSPACE_ROOT ?? "/workspace/.alwayswork";
const OBJ_DIR = path.join(ROOT, "objectives");
const REQ_DIR = path.join(ROOT, "requests");
const RES_DIR = path.join(ROOT, "results");

function hasBridge(): boolean {
  return existsSync(REQ_DIR) || existsSync(OBJ_DIR);
}

async function aw(args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(AW, args, { timeout: 30 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
    return (stdout + stderr).trim() || "(no output)";
  } catch (error) {
    const e = error as { message?: string; stdout?: string; stderr?: string };
    return ["command failed: " + (e.message ?? "unknown error"), e.stdout ?? "", e.stderr ?? ""].filter(Boolean).join("\n");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ask the node for an allowlisted operation through the bridge and wait for the result. */
async function bridge(op: string, args: string[] = [], timeoutMs = 10 * 60 * 1000): Promise<string> {
  mkdirSync(REQ_DIR, { recursive: true });
  const id = "req-" + randomBytes(8).toString("hex");
  const tmp = path.join(REQ_DIR, id + ".json.tmp");
  writeFileSync(tmp, JSON.stringify({ op, args, at: Date.now() }));
  renameSync(tmp, path.join(REQ_DIR, id + ".json")); // atomic: the path unit never sees a half-written file
  const result = path.join(RES_DIR, id + ".json");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(result)) {
      const r = JSON.parse(readFileSync(result, "utf8")) as { ok: boolean; rc: number; output: string };
      return (r.ok ? "" : `(failed, rc ${r.rc})\n`) + (r.output || "(no output)");
    }
    await sleep(500);
  }
  return "no answer from the node bridge within " + Math.round(timeoutMs / 1000) + "s (is alwayswork-bridge.path active on the node?)";
}

/** Route an operation: bridge inside the container, `aw` on the host. */
async function nodeOp(op: string, args: string[] = [], hostArgs: string[] = []): Promise<string> {
  return hasBridge() && !process.env.ALWAYSWORK_FORCE_AW ? bridge(op, args) : aw(hostArgs);
}

interface Objective { id: string; text: string; timeoutSec: number; createdAt: number; state: string }

function listObjectives(): Array<Objective & { result?: { state: string; summary?: string } }> {
  if (!existsSync(OBJ_DIR)) return [];
  const out: Array<Objective & { result?: { state: string; summary?: string } }> = [];
  for (const f of readdirSync(OBJ_DIR)) {
    if (!f.endsWith(".json") || f.endsWith(".result.json")) continue;
    try {
      const o = JSON.parse(readFileSync(path.join(OBJ_DIR, f), "utf8")) as Objective;
      const rf = path.join(OBJ_DIR, o.id + ".result.json");
      out.push({ ...o, ...(existsSync(rf) ? { result: JSON.parse(readFileSync(rf, "utf8")) } : {}) });
    } catch { /* skip unreadable */ }
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

function writeResult(id: string, state: "running" | "done" | "failed", summary: string): string {
  if (!/^obj_[A-Za-z0-9_-]{4,64}$/.test(id)) return "bad objective id";
  const f = path.join(OBJ_DIR, id + ".json");
  if (!existsSync(f)) return "unknown or already closed objective: " + id;
  const rf = path.join(OBJ_DIR, id + ".result.json");
  const tmp = rf + ".tmp";
  writeFileSync(tmp, JSON.stringify({ state, summary: summary.slice(0, 4000), at: Date.now() }));
  renameSync(tmp, rf);
  return `objective ${id} -> ${state}; the node reports it on its next heartbeat`;
}

const output = {
  schema: { type: "string" as const },
  render: (_args: Record<string, unknown>, value: string) => [{ type: "text" as const, text: value }],
};

export function apply(ctx: Context): void {
  // --- objectives (SYSTEM_SPEC §5.5) ------------------------------------------
  ctx.tools.register(defineTool({
    name: "alwayswork_objectives",
    description: "List the objectives the AlwaysWork control plane has given this node's agent (pending, running, and any result already written). Work on pending ones; report with alwayswork_objective_update.",
    parameters: {},
    output,
    async execute() {
      const list = listObjectives();
      if (!list.length) return "no open objectives";
      return list.map((o) => `${o.id} [${o.result?.state ?? "pending"}] (timeout ${o.timeoutSec}s)\n${o.text}` + (o.result?.summary ? `\n  summary: ${o.result.summary}` : "")).join("\n\n");
    },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_objective_update",
    description: "Report progress on an objective: 'running' while working, 'done' with a short summary of what was achieved, or 'failed' with why. The node forwards it to the control plane.",
    parameters: {
      id: { type: "string", required: true, description: "Objective id (obj_…)" },
      state: { type: "string", required: true, description: "running | done | failed" },
      summary: { type: "string", required: false, description: "What happened, for the operator (≤ 4000 chars)" },
    },
    output,
    async execute(args: { id: string; state: string; summary?: string }) {
      if (!["running", "done", "failed"].includes(args.state)) return "state must be running, done or failed";
      return writeResult(args.id, args.state as "running" | "done" | "failed", args.summary ?? "");
    },
  }));

  // --- node operations (through the bridge in a container, `aw` on a host) ---
  ctx.tools.register(defineTool({
    name: "alwayswork_status",
    description: "Show this AlwaysWork node's status: config, engine, capabilities, health and control link.",
    parameters: {},
    output,
    async execute() { return nodeOp("status", [], ["status"]); },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_doctor",
    description: "Run the scored security and health audit on this node and return its findings.",
    parameters: {},
    output,
    async execute() { return nodeOp("doctor", [], ["doctor"]); },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_services",
    description: "List the service workloads on this node (e.g. postgres) with health and how they are reached.",
    parameters: {},
    output,
    async execute() { return nodeOp("services", [], ["service", "list"]); },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_service",
    description: "Operate a service workload on this node: status, logs, snapshot (read-only btrfs snapshot of its data), or backup (logical dump). These are the same audited operations an operator runs by hand; use snapshot before anything risky.",
    parameters: {
      id: { type: "string", required: true, description: "Service id, e.g. postgres" },
      action: { type: "string", required: true, description: "status | logs | snapshot | backup" },
    },
    output,
    async execute(args: { id: string; action: string }) {
      if (!["status", "logs", "snapshot", "backup"].includes(args.action)) return "action must be status, logs, snapshot or backup";
      if (!/^[a-z][a-z0-9-]{0,31}$/.test(args.id)) return "bad service id";
      return nodeOp("service." + args.action, [args.id], ["service", args.action, args.id]);
    },
  }));

  // --- host-only tools (need `aw`; meaningless inside the container) -------------
  if (!hasBridge()) {
    ctx.tools.register(defineTool({
      name: "alwayswork_apply",
      description: "Reconcile this node to the desired state assigned by the control plane.",
      parameters: {},
      output,
      async execute() { return aw(["apply"]); },
    }));
    ctx.tools.register(defineTool({
      name: "alwayswork_install_app",
      description: "Install one or more tools from the curated catalog (for example ripgrep, lazygit, btop).",
      parameters: { ids: { type: "array", items: { type: "string" }, required: true, description: "Catalog app ids" } },
      output,
      async execute(args: { ids: string[] }) { return aw(["app", "install", ...args.ids]); },
    }));
    ctx.tools.register(defineTool({
      name: "alwayswork_enroll",
      description: "Enroll this node with the AlwaysWork control plane. Omit the token to claim and approve.",
      parameters: {
        control: { type: "string", required: true, description: "Control-plane base URL" },
        token: { type: "string", required: false, description: "Join token, if the console minted one" },
      },
      output,
      async execute(args: { control: string; token?: string }) {
        const cliArgs = ["enroll", "--control", args.control];
        if (args.token) cliArgs.push("--token", args.token);
        return aw(cliArgs);
      },
    }));
  }
}
