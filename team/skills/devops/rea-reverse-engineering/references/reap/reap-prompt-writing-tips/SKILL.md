---
name: reap-prompt-writing-tips
description: REA prompt pack:  Prompt-writing tips (0 ready-to-paste prompts). Use when doing reverse-engineering investigation of prompt-writing tips with REA (rea.tools) via an AI coding agent.
---

# REAP — Prompt-writing tips (why these work)

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

1. **One feature per prompt.** Broad "explain the whole app" questions return shallow maps; narrow ones return call chains and addresses.
2. **Demand evidence.** Every prompt here requires file/function/address citations — it stops the agent from confabulating.
3. **Separate fact / inference / unknown.** The three-bucket format keeps hypotheses honest.
4. **Static first.** Say "do not execute the application" until you actually need runtime observation.
5. **End with a deliverable.** SPEC.md, a reader script, a port plan, a minimal rebuild — a concrete artifact forces the agent to verify its own claims.
6. **State the scope out loud.** "Lab machine I own", "offline single-player", "document, don't bypass" — the framing keeps results usable for research and reporting.
