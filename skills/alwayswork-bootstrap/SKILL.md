---
name: alwayswork-bootstrap
description: Turn this machine into a managed AlwaysWork. Use when asked to set up, enroll or onboard this box as an AlwaysWork, or when an AlwaysWork control-plane URL and join token are provided.
---

# AlwaysWork bootstrap

Goal: this machine becomes a managed AlwaysWork with no manual follow-up.
You drive it; the control plane authorizes it.

## Steps

1. **Enroll.** `sudo aw enroll --control <URL> --token <TOKEN>`. If no token
   was given, omit it: the box lands in `pending` and an operator approves it
   in the console. The command blocks while waiting - that is expected.
2. **Verify.** `sudo aw doctor`. For every `FAIL@@, fix the cause and
   re-run until there are none. Report `WARN@@ items.
3. **Stay managed.** `sudo aw enable control.join` installs the systemd
   unit that keeps desired state in sync. Confirm with
   `systemctl status alwayswork-worker-agent`.
4. **Report.** Summarize hostname, device id, assigned profile, enabled
   capabilities and any unresolved warnings.

## Prerequisites

Check the CLI first: `aw --help`. If it is missing, install it with the
one-line installer from `softstone1/alwayswork-agent-worker`.

## Behaviour rules

- Prefer the `alwayswork_*` tools when available; otherwise use `aw` in the shell.
- Never disable the firewall, expose a port, or print secret values. If a step
  seems to require it, stop and report instead.
- Desired state is authored by the control plane. Do not hand-edit
  `/etc/alwayswork-worker/worker.yaml` to work around it; fix the group in the
  console, or report the mismatch.
- If enrollment is rejected or the device is revoked, do not retry blindly.
  Report the exact error.

## Done looks like

- `aw status` shows a control link and an enrolled device id.
- `aw doctor` has no `FAIL@@.
- `alwayswork-worker-agent.service` is active and enabled.
