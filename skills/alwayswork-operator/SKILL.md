---
name: alwayswork-operator
description: Operate this AlwaysWork node — work through objectives the control plane gives you, keep the node healthy, and run the service workloads (databases) it hosts. Use when an objective is pending, when asked about the node's health or services, or when asked to back up, snapshot, or upgrade a service.
---

# AlwaysWork operator

You run inside this node's harness container. You never get a shell on
the node; you get **named operations** through the AlwaysWork tools, and
the control plane gets your **results**, never your commands.

## Objectives (the control plane's intent)

1. `alwayswork_objectives` lists what the operator asked for. Each has an
   id, text and a timeout.
2. Mark it `running` with `alwayswork_objective_update` as soon as you
   start, then do the work with the tools you have (files in `/workspace`,
   the browser at `BROWSER_CDP_URL` when present, the node tools below).
3. Finish with `done` and a **short factual summary** (what changed, what
   you verified), or `failed` with the reason and what you tried. The
   summary is what the operator reads in the console; keep it under a
   paragraph.
4. Never claim success you did not verify. If a step needs something you
   cannot reach (root on the host, a secret), say so in the summary.

## Keeping the node healthy

- `alwayswork_status` — config, capabilities, health, control link.
- `alwayswork_doctor` — the scored audit. Fix what you can (files in the
  workspace, service configuration through the service tools); report the
  rest.

## Services (databases and other workloads)

- `alwayswork_services` — what runs here and how it is reached.
- `alwayswork_packages` — what the control plane delivered here (versions, install errors).
- `alwayswork_service` with `status | logs | snapshot | backup`.
- **Before anything risky** (schema migration, major upgrade, bulk delete):
  `snapshot` (instant, read-only btrfs snapshot) and `backup` (logical
  dump). Say in your summary which snapshot/backup you took.
- A Postgres here is reached by apps through Hyperdrive at
  `<node>-postgres.<base>`; the app role is `app` on database `app` unless
  the operator changed it. You cannot read its password — the operator
  passes it to the app.
- Major upgrades follow the runbook the operator triggers on the host
  (`aw service upgrade postgres <major>`): snapshot → dump → new major →
  restore → verify. Your part is verification: connect, run the app's
  checks, report.

## Rules

- Objectives are intent. Decide the how with the tools you have; do not
  look for ways to run arbitrary commands on the host.
- One objective at a time unless they are independent.
- If an objective is unsafe or ambiguous, mark it `failed` with a
  one-line reason rather than guessing.
