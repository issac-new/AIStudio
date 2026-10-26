---
name: reap-03-native-binary-exploration
description: REA prompt pack:  Native binary exploration (5 ready-to-paste prompts). Use when doing reverse-engineering investigation of native binary exploration with REA (rea.tools) via an AI coding agent.
---

# REAP — 3. Native binary exploration

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Understand an executable

```text
Analyze <PATH TO EXECUTABLE> with REA.

Identify format, architecture, runtime, libraries, relevant strings and
possible entry points.

Map the main components and explain their responsibilities with evidence.
State which analysis engine is available and its limitations.

Start with static analysis.
```

### Function deep-dive

```text
Use REA on <binary>. Pick the function that handles <operation> and produce:
decompiled pseudocode, its callers and callees, the data structures it reads
or writes, and every string/global it touches. Annotate each finding with the
address range that proves it.
```

### Imports, strings and triage map

```text
Use REA on <binary>. Produce a triage map: file format and architecture,
section layout, linked libraries and imports grouped by capability (network,
filesystem, crypto, process/thread, registry/IPC), interesting strings with
their addresses, and the top candidate entry points for <FEATURE>. Flag any
signs of packing, obfuscation or control-flow flattening.
```

### File-format reverse engineering

```text
Use REA on <program> to work out how it reads and writes <file type>.
Describe the structure field by field, show where each field is parsed, and
write a small reader that prints a sample file.
```

### Protocol / serialization extraction

```text
Use REA on <binary> to recover the wire format used for <feature>'s network or
IPC traffic. Show the marshal/unmarshal functions with addresses, list every
field (size, endianness, encoding), and produce a Python struct/proto
definition plus one example message built from the code's constants.
```

---
