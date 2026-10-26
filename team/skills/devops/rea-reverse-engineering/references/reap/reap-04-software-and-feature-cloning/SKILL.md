---
name: reap-04-software-and-feature-cloning
description: REA prompt pack:  Software & feature cloning (4 ready-to-paste prompts). Use when doing reverse-engineering investigation of software & feature cloning with REA (rea.tools) via an AI coding agent.
---

# REAP — 4. Software & feature cloning

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

> Clean-room methodology: extract *behavior*, not code. Never copy
> proprietary source, assets, branding or licensing mechanisms.

### Full application clone (behavioral)

```text
Use REA to study <application> as a black box for a clean-room clone.

Produce CLONE_SPEC.md covering: every user-visible feature, screen and state
machine; inputs, outputs and edge cases; file formats and network protocols it
uses; settings and persistence layout; error behaviors.

For each requirement, cite the evidence (function, address, string, captured
request). Mark anything unconfirmed as UNKNOWN. Do not copy code or assets —
I will implement from the spec only.
```

### Clone one feature into my own app

```text
Use REA to recover the exact behavior of <FEATURE> in <application>: trigger,
inputs, processing steps, outputs, side effects and failure modes.

Then implement <FEATURE> from scratch in <MY LANGUAGE/PROJECT> matching that
behavior, with tests derived from the recovered rules. List every observable
difference that remains between my version and the original.
```

### Validate a clone against the original

```text
Compare <MY IMPLEMENTATION> with the observed behavior of <ORIGINAL
APPLICATION>.

Use verify_reconstruction, if available. Check results, errors, limits and
state transitions.

Present passing cases, divergences and behaviors not yet tested. Do not
consider equivalence demonstrated just because a few examples passed.
```

### UI/UX behavior cloning without assets

```text
Use REA on <application> to document its interaction model: layout logic,
keyboard shortcuts, command dispatch, undo/redo semantics and clipboard
formats. Recreate the behavior in <my framework> using only my own visual
assets, matching the documented semantics. Show which original function
proves each documented rule.
```

---
