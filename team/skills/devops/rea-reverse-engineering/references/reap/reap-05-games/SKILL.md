---
name: reap-05-games
description: REA prompt pack:  Games (4 ready-to-paste prompts). Use when doing reverse-engineering investigation of games with REA (rea.tools) via an AI coding agent.
---

# REAP — 5. Games

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Gameplay logic recovery

```text
Use REA to reconstruct <GAME> from its executable. Recover the gameplay logic
in C and test it against the original.

For each mechanic (movement, physics, scoring, spawning), show the function,
the constants and the update loop that prove the rule.
```

### Speed / difficulty rule (dino-style)

```text
Use REA to inspect <game>. Why does <difficulty/speed> change over time? Show
the exact rule and the constants behind it, then build a small standalone
version with an adjustable parameter.
```

### Engine & asset pipeline map

```text
Use REA on <game executable/data folder>. Identify the engine or framework,
the render loop, the update/tick order, how levels and assets are loaded and
serialized, and where gameplay data lives (tables, scripts, archives). Map
each component to functions/addresses and describe the load pipeline step by
step.
```

### Single-player mod support (offline only)

```text
Use REA on <offline single-player game> to locate the code that controls
<weapon stats / spawn rates / economy>. Show the data tables or functions with
addresses. I only want to understand where the values live so I can build my
own offline trainer for personal experimentation — no multiplayer, no
persistence tricks.
```

---
