---
name: reap-02-feature-tracing-any-program
description: REA prompt pack:  Feature tracing (any program) (3 ready-to-paste prompts). Use when doing reverse-engineering investigation of feature tracing (any program) with REA (rea.tools) via an AI coding agent.
---

# REAP — 2. Feature tracing (any program)

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Explain one feature

```text
Use REA to investigate how <FEATURE> works in <PATH TO APPLICATION>.

Identify the entry point, the functions involved, the data flow, the
dependencies and the observable effects.

For every conclusion, present evidence: file, function, address or relevant
snippet. Separate confirmed facts, inferences and points that remain unknown.

Do not execute the application in this step.
```

### Trace a button to its effect

```text
Use REA on <app>. Start at the <button name> button and trace what happens
until the result is written, sent or shown. Name every module or function on
the path and what each one does.
```

### Recover a rule and rebuild it

```text
Use REA to find the rule that controls <behaviour> in <program>. Write the
rule in plain words, then build a minimal standalone version I can run, and
give me one input that proves it matches the original.
```

---
