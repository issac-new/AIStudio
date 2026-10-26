---
name: reap-13-dma-and-hardware-assisted-cheat-research-defensive
description: REA prompt pack:  DMA & hardware-assisted cheat research (defensive) (4 ready-to-paste prompts). Use when doing reverse-engineering investigation of dma & hardware-assisted cheat research (defensive) with REA (rea.tools) via an AI coding agent.
---

# REAP — 13. DMA & hardware-assisted cheat research (defensive)

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

> DMA attacks are a real anti-cheat and platform-security problem. Use these
> to **study how detection works** and to **harden your own product/lab** —
> on machines you own, offline targets, or with vendor authorization. Reading
> another machine's memory over PCIe without authorization is illegal in most
> jurisdictions.

### How DMA memory access works on a target platform

```text
Use REA on <anti-cheat driver / DMA-protection firmware (e.g. Thunderbolt
security, IOMMU/VT-d config)> in my lab.

Explain, with function/address evidence: how the platform restricts external
PCIe memory reads (IOMMU mappings, Thunderbolt ACLs, kernel DMA protection),
what the anti-cheat enumerates to spot a DMA device (PCIe topology, BAR
regions, unknown root ports, timing anomalies), and which checks are
load-bearing versus cosmetic.
```

### Analyze a DMA-cheat toolchain sample (malware-style)

```text
I have a sample <DMA firmware / PCILeech-style driver / user-mode reader> for
defensive research. Use REA to document: how it opens physical memory
(XNVIPHYSTREE-style access, PCIe BAR mapping), how it locates the game process
(PEB walking, page-table traversal), what it reads/writes, and any
anti-detection tricks (pattern scanning avoidance, timing padding). Give the
function chain with addresses for each stage. Do not run it against any live
game — analysis only.
```

### Detection-gap analysis for my own product

```text
Use REA to evaluate how <my application/my anti-cheat component> would react
to external physical memory access: which integrity checks exist, whether
sensitive values sit in predictable memory, what side-channel validation the
server performs. Propose concrete hardening (value obfuscation, server-side
validation, memory layout randomization) mapped to the code locations that
need each change.
```

### FPGA/microcontroller device firmware study

```text
Use REA on <device firmware dump> from a PCIe/USB device I own. Identify the
MCU/FPGA soft-core, the protocol it speaks to the host, the memory-read
primitives it implements, and how it hides from host enumeration. Show
evidence per claim and label anything that needs runtime confirmation.
```

---
