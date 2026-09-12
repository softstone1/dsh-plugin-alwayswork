import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

const execFileAsync = promisify(execFile);

export const name = "alwayswork";
export const inject = ["tools"];

const AW = process.env.ALWAYSWORK_AW_BIN ?? "aw";

/** Run the alwayswork-worker CLI and return combined output (never throws). */
async function aw(args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(AW, args, {
      timeout: 30 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return (stdout + stderr).trim() || "(no output)";
  } catch (error) {
    const e = error as { message?: string; stdout?: string; stderr?: string };
    return ["command failed: " + (e.message ?? "unknown error"), e.stdout ?? "", e.stderr ?? ""]
      .filter(Boolean)
      .join("\n");
  }
}

const output = {
  schema: { type: "string" as const },
  render: (_args: Record<string, unknown>, value: string) => [{ type: "text" as const, text: value }],
};

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: "alwayswork_status",
    description: "Show this AlwaysWork worker's status: config, engine, capabilities and control link.",
    parameters: {},
    output,
    async execute() {
      return aw(["status"]);
    },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_doctor",
    description: "Run the scored security and health audit on this worker and return its findings.",
    parameters: {},
    output,
    async execute() {
      return aw(["doctor"]);
    },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_apply",
    description: "Reconcile this worker to the desired state assigned by the control plane.",
    parameters: {},
    output,
    async execute() {
      return aw(["apply"]);
    },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_install_app",
    description: "Install one or more tools from the curated catalog (for example ripgrep, lazygit, btop).",
    parameters: {
      ids: { type: "array", items: { type: "string" }, required: true, description: "Catalog app ids" },
    },
    output,
    async execute(args: { ids: string[] }) {
      return aw(["app", "install", ...args.ids]);
    },
  }));

  ctx.tools.register(defineTool({
    name: "alwayswork_enroll",
    description: "Enroll this worker with the AlwaysWork control plane. Omit the token to claim and approve.",
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

  ctx.tools.register(defineTool({
    name: "alwayswork_report",
    description: "Report this worker's state to the control plane once: heartbeat and reconcile.",
    parameters: {},
    output,
    async execute() {
      return aw(["agent", "1"]);
    },
  }));
}
