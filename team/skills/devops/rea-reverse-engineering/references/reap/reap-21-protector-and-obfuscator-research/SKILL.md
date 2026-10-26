---
name: reap-21-protector-and-obfuscator-research
description: REA prompt pack:  Protector & obfuscator research (7 ready-to-paste prompts). Use when doing reverse-engineering investigation of protector & obfuscator research with REA (rea.tools) via an AI coding agent.
---

# REAP — 21. Protector & obfuscator research

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

> Scope: protectors on **software you own** (hardening assessment), malware
> samples, crackmes/CTFs, or vendor-authorized research. These prompts ask the
> agent to *identify, characterize and document* protections and to plan
> analysis — not to produce weaponized bypasses of third-party commercial
> software.

### Protector fingerprinting

```text
Use REA on <binary>. Determine whether it is protected/packed and by what:
UPX (section names, entry stub, low entropy after unpacking), VMProtect/Themida
(.vmp/.themida sections, huge virtualized functions, handler tables), Arxan
(embedded watermark checks, code mutation markers), .NET obfuscators
(SmartAssembly/GuardSquare-style renamed types, control-flow-encoded methods),
Android packers/hardening (Appdome/WhiteCrypt-style native stubs, extra .so
loaders, DexGuard string encryption).

Report: which protector(s), the version indicators you can see, which sections
are original vs. synthetic, and which code regions are protected versus plain.
Cite section headers, addresses and string fingerprints for each conclusion.
```

### UPX / simple packer: unpack-and-verify

```text
Use REA on <packed binary>. Confirm the packer (UPX header, stub
characteristics), then produce the unpacked image: either a clean static
unpack or the reconstructed original sections from the runtime layout. Verify
the result — entry point, imports rebuilt, section entropy — and diff the
unpacked binary's capability map against the packed one so nothing was lost.
Document each step with addresses.
```

### VMProtect / Themida region mapping (own software or CTF)

```text
Use REA on <binary I own or a crackme> that uses VM-style protection.

Map the protection surface without trying to defeat it: locate the VM entry
stubs, the context structure, the handler dispatch table, and classify which
functions are virtualized versus native. For the virtualized regions, estimate
the opcode set size and identify handlers you can already recognize (memory
read/write, arithmetic, branch). Deliver a coverage map: function → protected
or plain → confidence, with evidence. This map is the input for a later
deobfuscation plan, not a bypass.
```

### Anti-debug / anti-VM / anti-tamper inventory

```text
Use REA on <binary> to inventory its self-protection checks: anti-debug
(Peek/Push/IsDebuggerPresent, timing checks, hardware-breakpoint flags),
anti-VM (registry/firmware artifacts, MAC/vendor strings, CPUID tricks),
integrity checks (self-hashing regions, CRC tables), and tamper responses
(silent flags vs. crash vs. report-to-server).

For each check: the function/address, what triggers it, and what happens on
failure. Then — for software I own — state which checks are load-bearing for
security and which are cosmetic, with recommended fixes.
```

### Appdome / WhiteCrypt / Proton Shield-style mobile hardening study

```text
Use REA on <APK/AAB> that uses a commercial hardening layer (Appdome-style
runtime protection, WhiteCrypt-style embedded crypto, DexGuard/GuardSquare-style
Java obfuscation).

Document: where the hardening stub lives (loader .so, injected classes, manifest
hooks), what it wraps (DEX decryption, string decryption, root/hook/emulator
detection), which original classes are deferred to runtime, and what remains
statically analyzable. Identify the detection callbacks the protection exposes
to the app. Give file/class/address evidence per finding and label anything
that needs dynamic confirmation in an isolated lab device.
```

### Arxan-style watermark & mutation analysis

```text
Use REA on <binary I own or am authorized to study> suspected of embedding
code-mutation watermarks (Arxan-style per-copy variants).

Identify the mutation sites: instruction-level variants between two builds of
the same function, redundant/mutated code inserted at call sites, and the
verification routine that reads the watermark. Explain how the scheme
distinguishes copies and which regions are watermark-bearing versus real
logic, with addresses for each variant pair. Goal: understand the attribution
mechanism for a security review of my own product.
```

### Protection hardening assessment for my own product

```text
I own <my application> and its protection stack (<protector names>). Use REA to
assess the protection as an attacker would measure it: coverage (what % of
license-critical and security-critical code is actually protected vs. plain),
layered checks (which fail silently vs. loudly), the weakest protected path to
<the feature being protected>, and anti-analysis depth.

Deliver a risk-ranked report: each weakness with function/address evidence,
the protection feature that should have covered it, and a concrete hardening
recommendation. Document weaknesses; do not produce a working bypass.
```

---
