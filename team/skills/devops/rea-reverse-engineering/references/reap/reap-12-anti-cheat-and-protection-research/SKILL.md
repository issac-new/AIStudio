---
name: reap-12-anti-cheat-and-protection-research
description: REA prompt pack:  Anti-cheat & protection research (4 ready-to-paste prompts). Use when doing reverse-engineering investigation of anti-cheat & protection research with REA (rea.tools) via an AI coding agent.
---

# REAP — 12. Anti-cheat & protection research

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

> Scope these at **your own machine, your own software, a vendor bug bounty,
> a CTF, or academic study**. Never at other players' live game sessions.

### Map an anti-cheat's detection surface

```text
Use REA to analyze <anti-cheat driver/service binary> on a lab machine I own.

Identify: what it enumerates (processes, modules, handles, callbacks), which
integrity checks it performs, what it hooks or registers with the kernel, and
what data it sends out (endpoints, intervals, payload fields).

For each finding cite the function/address. Separate "code present" from
"behavior observed". Do not run the target game; static analysis first.
```

### Test my own product's protections

```text
I own <my application> and its protection scheme. Use REA to assess it as an
attacker would: locate the license check, the integrity checks, the
anti-debug/anti-VM tricks, and trace what a failed check does. Report which
checks are trivially bypassable, which are load-bearing, and concrete fixes —
each claim backed by file/function/address evidence.
```

### User-mode anti-cheat DLL anatomy

```text
Use REA on <anti-cheat user-mode DLL/service> from a game I own, on a lab
machine, for defensive research. Map: what it enumerates at startup (loaded
modules, handle counts, window titles, device paths), which hooks it installs
(IAT/EAT, inline, syscall stubs), how it detects debuggers and memory
readers, and how it packages + ships detections (endpoint, payload fields,
hashing of module code sections). For each mechanism give the function/
address and say whether it is confirmed statically or needs runtime
observation. Do not attach to or interfere with a live game session.
```

### DRM / license flow analysis (interoperability)

```text
Use REA on <application> to document its licensing flow: where entitlement is
validated, what local and remote checks exist, what state is stored on disk,
and how offline mode behaves. Goal is interoperability and security review of
software I legitimately own. Report facts with evidence; flag anything you
could not confirm.
```

---
