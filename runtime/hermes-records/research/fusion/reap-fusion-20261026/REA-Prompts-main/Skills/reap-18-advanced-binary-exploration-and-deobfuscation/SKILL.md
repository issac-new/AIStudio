---
name: reap-18-advanced-binary-exploration-and-deobfuscation
description: REA prompt pack:  Advanced binary exploration & deobfuscation (8 ready-to-paste prompts). Use when doing reverse-engineering investigation of advanced binary exploration & deobfuscation with REA (rea.tools) via an AI coding agent.
---

# REAP — 18. Advanced binary exploration & deobfuscation

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Control-flow flattening recovery

```text
Use REA on <binary>. The function(s) handling <FEATURE> appear
control-flow-flattened (dispatcher state variable, giant switch/branch chain).

Identify the state variable, map each state to its real block, and reconstruct
the original logical flow as pseudocode or a graph. Show the address ranges for
the dispatcher, the states, and the reconstructed sequence. Note which parts
remain ambiguous.
```

### String and constant decryption pass

```text
Use REA on <binary>. Locate the string-decryption routine(s) (per-call
decoding, single init loop, or lazy decryption), recover the algorithm and
keys with addresses, then produce a decrypted string table: offset, encoded
form, decoded form, and the function(s) that reference each string. If the
scheme is uniform, write a script that reproduces the decryption offline.
```

### Opaque predicates and dead-code stripping

```text
Use REA on <binary> around <function/address range>. Identify opaque
predicates (always-true/false branches built from constant arithmetic or
self-referencing checks) and dead code inserted to mislead analysis.

For each: the address, why it is provably constant, and which branch is real.
Produce a cleaned control-flow view of the function with the noise removed,
keeping the evidence for every removal decision.
```

### Virtualized / threaded code identification

```text
Use REA on <binary>. Determine whether <function> is native or runs inside a
VM-style handler (opcode dispatch loop, context structure, handler table).

Map the handler table: opcode → handler address → operation class (load,
store, arithmetic, branch, call). Estimate how many distinct opcodes exist and
which original operations you can already recognize. Do not attempt to defeat
the protection — I want the structure documented first.
```

### Mixed-mode binary: managed + native boundary

```text
Use REA on <application> that mixes .NET/Java managed code with native
libraries. Locate every P/Invoke, JNI, or COM boundary relevant to <FEATURE>,
trace the call from managed code into the native function and back, and
document what data crosses each boundary in what form. Cite managed
method tokens/names and native addresses for each hop.
```

### Struct & type recovery from access patterns

```text
Use REA on <binary>. Pick the structure that <function> operates on and
reconstruct it field by field: every access offset in the code proves a
field's position, and the width of each load/store proves its size. Infer
field semantics from how each is used (counter, pointer, flag, length,
callback). Emit a C header with recovered struct definitions, named fields
and a comment per field citing the address range that proves it. Propose
type annotations I can load into the decompiler.
```

### Calling-convention & stack-frame reconstruction

```text
Use REA on <binary> around <function/address>. The decompiler mis-models
this function. Reconstruct the real frame: prologue/epilogue, saved
registers, local slots, stack canary handling, and the argument registers/
stack slots at entry. Determine the calling convention from how callers pass
arguments and how the callee cleans the stack. Rewrite the signature and
re-decompile with the corrected frame; show the instruction evidence for each
frame slot.
```

### Cross-binary function matching (diffing two builds)

```text
Use REA to match functions between <binary v1> and <binary v2> of the same
program. Use structural similarity (CFG shape, instruction counts, call
graph, string/global references), not just hashes, so compiler reordering
doesn't break the mapping. Produce a matched-pairs table with confidence,
then list the functions that changed most between versions and what the
change appears to be (added check, new branch, refactored loop) with
addresses on both sides.
```

---
