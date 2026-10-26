---
name: reap-14-software-cracking-research
description: REA prompt pack:  Software cracking research (3 ready-to-paste prompts). Use when doing reverse-engineering investigation of software cracking research with REA (rea.tools) via an AI coding agent.
---

# REAP — 14. Software cracking research

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

> For studying protection schemes, crackmes/CTFs, malware-adjacent RE, and
> hardening your own software. Not a guide to pirate other people's products.

### Keygen-repair style analysis (document, don't bypass)

```text
Use REA on <binary> to find the validation routine for <license key / serial>.
Recover the algorithm (decompile it), identify the input encoding, the
checksum/transform steps and the success/failure branches with addresses.
Then write a test harness that exercises the recovered algorithm against
sample inputs. Do not patch or bypass anything — I want the algorithm
documented, not the check removed.
```

### Crackme / CTF challenge solving

```text
Use REA on this crackme: <path>. Enumerate entry points, strings, imports and
any packer/protection indicators. Identify the flag-checking logic, decompile
it, and derive the correct input from the recovered algorithm. Show the full
evidence chain: address → instruction → conclusion.
```

### Protection-diffing between versions

```text
Use REA to compare <protected app v1> and <v2>. Identify what changed in the
protection layer: new integrity checks, new anti-debug tricks, changed
validation paths. Map each change to functions/addresses and explain the
hardening intent.
```

---
