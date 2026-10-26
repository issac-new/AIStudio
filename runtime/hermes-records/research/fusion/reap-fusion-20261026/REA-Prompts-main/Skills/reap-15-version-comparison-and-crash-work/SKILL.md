---
name: reap-15-version-comparison-and-crash-work
description: REA prompt pack:  Version comparison & crash work (1 ready-to-paste prompts). Use when doing reverse-engineering investigation of version comparison & crash work with REA (rea.tools) via an AI coding agent.
---

# REAP — 15. Version comparison & crash work

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Compare two versions

```text
Use the compare_application_versions workflow, if available, to compare
<OLD VERSION> and <NEW VERSION> of <application>.

Identify functional changes, API changes, dependency and permission changes,
and possible security fixes.

Map each change to the corresponding functions or files and explain the
impact. Differentiate build changes from behavior changes.
```

---
