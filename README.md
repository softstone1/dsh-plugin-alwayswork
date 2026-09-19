# dsh-plugin-alwayswork

A DSH (Cordis) tool plugin that lets the node's agent work with AlwaysWork:
take **objectives** from the control plane and report results, and operate
the node and its **service workloads** through an allowlisted bridge.

It runs in two places and picks the right channel itself:

| Where | Channel |
|---|---|
| Inside the `agents.dsh` workload container (standard) | files under `/workspace/.alwayswork` shared with the node's agent: `objectives/` (from the control plane), `requests/` → `results/` (the host bridge, `alwayswork-bridge.path` on the node) |
| On a host with `aw` on PATH (legacy `mode: host`) | shells out to `aw` |

## Tools

| Tool | What it does |
|------|--------------|
| `alwayswork_objectives` | list open objectives (pending / running / result written) |
| `alwayswork_objective_update` | report `running`, `done` (summary) or `failed` (reason); the node forwards it on heartbeat |
| `alwayswork_status` | node status |
| `alwayswork_doctor` | scored security and health audit |
| `alwayswork_services` | service workloads on the node with health |
| `alwayswork_service` | `status \| logs \| snapshot \| backup <id>` — the same audited operations an operator runs |
| `alwayswork_apply`, `alwayswork_install_app`, `alwayswork_enroll` | host only |

Never a command line: the bridge accepts named operations with validated
arguments (`lib/objectives.sh` in the agent repo).

## Install

Add the module to a DSH composition. Minimal `cordis.yml`:

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './src/index.ts'
```

Environment: `ALWAYSWORK_WORKSPACE_ROOT` (default `/workspace/.alwayswork`),
`ALWAYSWORK_AW_BIN` (host mode), `ALWAYSWORK_FORCE_AW=1` to force host mode.

## Skills

- `skills/alwayswork-operator/SKILL.md` — objectives, node health, services
  (snapshot before risk, verify before "done").
- `skills/alwayswork-bootstrap/SKILL.md` — the host-mode bootstrap objective.
