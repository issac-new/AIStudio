---
name: acp-provider-free-window-routing
description: "Use when routing ACP work to a provider free window."
version: 1.0.0
metadata:
  hermes:
    tags: [acp, provider-routing, free-window, model-priority, cold-start]
---

# ACP Provider Free-Window Routing

Class-level workflow for making a time-limited provider promotion effective across
Hermes ACP calls without mistaking configuration intent for runtime proof.

## Always-on rules

- Treat the provider's own model-catalog priority as the source-layer default. A
  client-side env pin or a Hermes config entry does not prove that fresh ACP
  sessions select the intended model.
- Separate three claims: model selected, request succeeded, and request was free.
  Each needs its own evidence; a successful config write proves none of them.
- Never send a prompt while validating a paid/free boundary. A cold-start probe
  must perform only `initialize` and `session/new`, then terminate the child.
- Read the ACP session's actual model option from `session/new.result.configOptions[]`
  where `id == "model"`, using `currentValue`. Do not assume a top-level `models`
  field exists; an absent field creates a false failure.
- After changing provider priority or environment, kill existing provider-server
  children before probing. Long-lived adapters retain their startup environment
  and configuration.
- Never claim “all calls are free” from one surface's result. Check each call
  throat plus usage/quota evidence, and identify unpinned surfaces (fresh sessions,
  subagents, and other clients).

## Procedure

1. Record the exact ACP binary, provider catalog, model ID, window rule, and all
   call surfaces. Redact credentials and payloads.
2. Change the provider catalog priority so the promoted model is the default;
   preserve a backup and read back the exact key/value and ordering.
3. Ensure the Hermes ACP route carries its intended env/model settings, but treat
   those as defense-in-depth rather than the acceptance proof.
4. Stop surviving adapter processes (`pkill -f zcode-acp-server` or the provider's
   exact process selector). Confirm no old child remains before testing.
5. Cold-start the binary and send `initialize`, then `session/new` only. Extract
   `configOptions[id=model].currentValue`; require the promoted model ID. Record
   the real output, not a hand-written status.
6. Run one minimal end-to-end request through the actual Hermes throat only after
   the prompt-free selection probe passes. Verify provider/model in the client
   ledger and the provider request log.
7. Compare before/after quota or usage snapshots. A model name or priority is not
   billing evidence.
8. If fleet copies are synchronized, hash every deployment root separately;
   verify source hash, active profile root, and workspace/sandbox copies. Run
   `py_compile` plus a key-symbol check, because syntax-valid truncation can still
   remove the client implementation.
9. Report observed route, exact selected model, smoke result, quota evidence,
   time-window scope, and remaining bypass surfaces.

## Failure patterns

- A failed `&&` chain means later verification never ran. Re-run verification as
  a separate command and do not report a hash or recovery result not observed in
  output.
- A backup labelled by repair date may be the pre-repair snapshot. Diff it against
  a known-healthy live copy and check mechanism markers before calling it golden.
- A per-session pin can be rejected by a server version. Do not make it the sole
  guard; rely on provider-catalog default selection plus a fresh-session probe.
- Killing a child that is immediately respawned is not proof of failure. Inspect
  the parent and verify the replacement process starts after the configuration
  change.
- A cold-start probe proves default resolver selection, not free billing. Keep
  the real request and quota check as separate gates.

## References

- Add provider-specific probe recipes under `references/` only when they apply to
  more than one incident; do not create date- or incident-named files.
