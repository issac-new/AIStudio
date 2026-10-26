---
name: reap-20-advanced-software-cloning-and-feature-reconstruction
description: REA prompt pack:  Advanced software cloning & feature reconstruction (5 ready-to-paste prompts). Use when doing reverse-engineering investigation of advanced software cloning & feature reconstruction with REA (rea.tools) via an AI coding agent.
---

# REAP — 20. Advanced software cloning & feature reconstruction

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

> Clean-room rules unchanged: extract behavior and interfaces, never code,
> assets, branding or licensing mechanisms. Interoperability and research use.

### Full protocol reimplementation for interoperability

```text
Use REA on <application> to recover its <network protocol / file format>
completely enough to interoperate: every message or record type, field
layouts, endianness, state machine transitions, handshake/auth sequence,
error codes and keep-alive behavior.

Deliver: a machine-readable spec (JSON Schema or protobuf), a working
client/server implementation in <language> that speaks the recovered protocol
against the original application, and a test log proving each message type
round-trips. Cite the marshal/unmarshal functions with addresses for every
field. Mark anything untested as UNKNOWN.
```

### Algorithm extraction to a standalone library

```text
Use REA on <application>. Isolate the pure algorithm behind <feature> (its
math, tables, constants and edge-case handling) from all UI, I/O and platform
code. Reimplement it from scratch in <language> as a library with a public API
matching the observable behavior, then run a differential test: same inputs
through original and clone, compare outputs across normal, boundary and
malformed cases. Report the match rate and every divergence.
```

### State machine / business-logic reconstruction

```text
Use REA on <application> to document the state machine governing <workflow>:
enumerate states (from enums, flags, or dispatch tables with addresses),
transitions, guards, and side effects per transition. Render it as a diagram
plus a table, then implement the same machine in <my project> and write tests
that replay every transition you documented.
```

### Plugin/extension ABI reconstruction

```text
Use REA on <host application> to recover its plugin interface: the exported
functions a plugin must provide, the callback table the host passes in, the
struct versions, and how plugins are discovered and loaded. Build a minimal
working plugin for my own feature using only the recovered ABI, and document
each ABI element with the address that proves it.
```

### Behavioral equivalence harness

```text
Build a differential-testing harness between <MY CLONE> and <ORIGINAL
APPLICATION>: derive the observable-behavior matrix from the CLONE_SPEC.md
already produced (inputs, outputs, errors, state transitions, file formats),
run both sides against the same corpus, and emit a divergence report. Do not
declare equivalence from spot checks — the report must cover every spec item,
with PASS / FAIL / NOT-TESTED per item.
```

---
