---
name: reap-09-kernel-analysis
description: REA prompt pack:  Kernel analysis (3 ready-to-paste prompts). Use when doing reverse-engineering investigation of kernel analysis with REA (rea.tools) via an AI coding agent.
---

# REAP — 9. Kernel analysis

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Driver inspection (Windows / Linux)

```text
Use REA on <driver binary: .sys / .ko>.

Identify the format and target OS version, the entry/init routine, the device
object and driver dispatch table, every IOCTL code with its input/output
buffer validation, the callbacks/notifications it registers, and the memory it
reads or writes outside its own allocations.

Map each finding to function/address evidence. Static analysis only — do not
load the driver.
```

### IOCTL attack-surface enumeration

```text
Use REA on <driver>. Enumerate all control codes handled, and for each:
the handler function, how it validates input/output buffers (probe methods,
size checks, IRQL assumptions), and any copy_to_user/copy_from_user or
memcpy with attacker-controlled length. Rank the handlers by risk with
evidence for the ranking.
```

### Kernel subsystem / syscall behavior

```text
Use REA on <kernel binary or module> to explain how <subsystem/syscall>
processes <input>. Trace from the syscall/dispatch entry to the parsing
functions, show bounds checks (or their absence), the data structures
populated, and error paths. Cite addresses for each step.
```

---
