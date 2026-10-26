---
name: reap-22-go-and-rust-binary-source-recovery
description: REA prompt pack:  Go & Rust binary source recovery (7 ready-to-paste prompts). Use when doing reverse-engineering investigation of go & rust binary source recovery with REA (rea.tools) via an AI coding agent.
---

# REAP — 22. Go & Rust binary source recovery

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

> Go and Rust ship rich metadata in their binaries (Go: pclntab, moduledata,
> full type/goroutine runtime; Rust: panic strings, `core::` symbols, crate
> names, monomorphized function names). Recovery here means reconstructing
> *structure and logic* — readable pseudocode, package/module layout, type
> definitions — not literally the original `.go`/`.rs` files. Say so honestly
> in the report. Scope: binaries you own or are authorized to analyze.

### Go binary: symbol & package map

```text
Use REA on <Go binary (.exe or Linux ELF) built with Golang>.

Recover the package layout from the pclntab / moduledata: every function
symbol with its full package path (main.*, vendor/*, dependency modules),
the Go version and build ID, and the dependency list embedded in the binary.
Map main.main and main.init to their call graph. Deliver a package tree with
function counts per package and the addresses proving each symbol.
```

### Go binary: function-level logic recovery

```text
Use REA on <Go binary>. For the functions in package <package or main> that
implement <FEATURE>, produce readable pseudocode: recover the Go calling
convention (stack-based args, ABIInternal registers), map defer/panic
handling, goroutine/channel operations (runtime.chanrecv/chansend sites) and
interface dispatch (itab/iface calls). Reconstruct each function's signature
from argument loads and return stores. Cite address ranges per recovered
statement group; separate confirmed logic from inference.
```

### Go binary: type & struct reconstruction

```text
Use REA on <Go binary>. Walk the Go type metadata (runtime.types / itab
tables) reachable from <FEATURE>'s code path and reconstruct the struct
definitions: field offsets, widths and likely types from how each field is
accessed, plus interface method sets from itabs. Emit Go-style type
declarations with a comment citing the metadata address that proves each
field. Note where GC bitmaps or padding make a field uncertain.
```

### Rust binary: crate & symbol map

```text
Use REA on <Rust binary (.exe or Linux ELF)>. Identify the Rust version and
profile (debug vs release: presence of panic-location strings, `core::fmt`
shims) from embedded metadata and panic strings. Enumerate crate names from
symbol paths and panic locations (file paths leaked in `#[track_caller]`
strings), map monomorphized generics back to their generic parents, and
produce a crate/module tree with the addresses proving each entry.
```

### Rust binary: logic recovery with trait-dispatch awareness

```text
Use REA on <Rust binary>. For the functions implementing <FEATURE>, produce
readable pseudocode that accounts for Rust idioms: Result/Option propagation
(branch-on-discriminant patterns), drop glue and ownership transfers,
vtable-based trait-object dispatch (recover the vtable at its data address
and name each slot), iterator adapters (inlined loop state machines), and
panic/fmt call sites as string anchors. Reconstruct signatures from the
Itanium/mangling where symbols survive; where stripped, infer from register
usage. Cite addresses per claim and mark inferred names as hypotheses.
```

### Stripped Go/Rust binary: metadata-first triage

```text
Use REA on <stripped Go or Rust binary>. Before touching code, extract what
survives stripping: Go pclntab still yields full function names and line
tables even after `strip`/`-ldflags -s -w` (locate the tab via runtime
pointers and rebuild the symbol table); Rust panic strings and file paths
still name crates and source files. Rebuild the function-name → address map
from whichever metadata is present, then start the <FEATURE> trace from the
recovered names. Report exactly which metadata you found and what is
irrecoverably gone.
```

### Binary-to-source fidelity report

```text
Based on the REA findings for <Go/Rust binary>, write a RECOVERY_REPORT.md:
for each recovered module, state whether the reconstruction is (a) symbol-
exact (names from metadata), (b) structure-exact (types/fields proven by
access offsets), or (c) behavior-only (pseudocode with inferred names).
Include the reconstructed source tree layout, per-file confidence level, and
the evidence addresses behind each classification. Do not present inferred
code as the original source.
```

---
