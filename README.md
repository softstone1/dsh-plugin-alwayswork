# dsh-plugin-alwayswork

A DSH (Cordis) tool plugin that lets an AI agent drive AlwaysWork
enrollment and operations, so a box onboards and maintains itself.

## Tools

| Tool | What it does |
|------|--------------|
| `alwayswork_enroll` | announce this worker and wait for approval |
| `alwayswork_status` | worker status: config, engine, capabilities, control link |
| `alwayswork_doctor` | scored security and health audit |
| `alwayswork_apply` | reconcile to the assigned desired state |
| `alwayswork_install_app` | install tools from the curated catalog |
| `alwayswork_report` | heartbeat and reconcile once |

Each tool shells out to the `aw` CLI (override with `ALWAYSWORK_AW_BIN`). The
plugin never talks to the control plane directly; it drives the same audited
path a human would.

## Install

Add the module to a DSH composition. Minimal `cordis.yml`:

```yaml
- name: '@deepseek-ai/dsh-system-prompt'
- name: '@deepseek-ai/dsh-tools'
- name: './src/index.ts'
```

For a persistent profile, add the package as a profile dependency and include
this module in the overlay. See the DSH Cordis tutorial, chapter 7.

## Skill

`skills/alwayswork-bootstrap/SKILL.md` is the bootstrap objective: enroll,
verify, stay managed, report.

## Safety

The plugin exposes no privilege the `aw` CLI does not already have.
Enrollment is host-initiated and operator-approved; desired state is authored
by the control plane; every operator action is audited; the worker is
fail-closed while pending or revoked.

## Related

- `softstone1/alwayswork-agent-worker` - the box-side CLI and capabilities
- `softstone1/alwayswork-control` - the control plane
