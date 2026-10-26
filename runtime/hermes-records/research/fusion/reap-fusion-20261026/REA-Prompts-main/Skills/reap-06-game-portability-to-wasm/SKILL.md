---
name: reap-06-game-portability-to-wasm
description: REA prompt pack:  Game portability to WASM (3 ready-to-paste prompts). Use when doing reverse-engineering investigation of game portability to wasm with REA (rea.tools) via an AI coding agent.
---

# REAP — 6. Game portability to WASM

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Port a native game to the browser

```text
Use REA to analyze <game executable/source> as a portability target for WASM.

Map: the main loop and frame pacing, the rendering backend (OpenGL/DirectX/
SDL/Vulkan calls), filesystem and save paths, threading model, audio output,
input handling, and any platform-specific APIs or inline assembly.

For each, classify as: portable as-is / needs shim / must be rewritten. Cite
the functions and call sites that prove each classification.
```

### Build the port plan

```text
Based on the REA findings for <game>, produce a WASM port plan:
- toolchain choice (Emscripten or manual recompile) and required shims
  (GL→WebGL, SDL→SDL2-compat, pthreads→SharedArrayBuffer/threads);
- the minimal set of source modules to compile;
- how saves move to IndexedDB and assets to fetch/streaming;
- performance risks found in the native code (allocation per frame, busy
  loops, 64-bit assumptions) with function evidence;
- a milestone list ending in a playable index.html.
```

### Port the logic core first (headless)

```text
Use REA to isolate <game>'s pure simulation logic (physics, AI, rules) from
rendering and OS calls. Extract the exact rules with evidence, then implement
that logic core in C/Rust compiled to WASM with a test harness that replays
recorded inputs and compares state hashes against the original behavior.
```

---
