# agent 0.21.x→0.22.1 补丁断裂清单（run20 收尾批·干跑实测）

- 基线：干净 v0.22.1（297552a9d64，detached worktree 实测 2026-10-15 13:2x）
- 干跑：git apply --check，65 个 agent 补丁，**19 件断裂**（其余 46 件干净适用）
- 注：bd767bf7 已重定位 569/604/605 三件（对升级树口径），本清单为干净基线口径——两口径差异待升级批合并裁定

## 断裂 19 件

```
107-agent-health-proxy.patch
157-agent-health-detailed-401-fallback.patch
117-agent-default-workspace-kind-dir.patch
178-agent-kanban-cli-verbs.patch
179-agent-projects-list-json.patch
250-agent-health-loaded-platforms.patch
273-agent-tests-pin-scratch-default.patch
372-agent-tick-socket-fallback.patch
374-agent-matrix-room-tools.patch
390-agent-kanban-home-default-board.patch
391-agent-kanban-board-team-fence.patch
395-agent-tool-fail-cascade.patch
396-agent-exa-mcp-catalog.patch
397-agent-lsp-tool.patch
399-agent-kanban-column-gates.patch
400-agent-compact-six-segment-handoff.patch
401-agent-runaway-guard-six-signals.patch
404-agent-roster-config-layer.patch
405-agent-ngram-checkpoint-writer.patch
406-agent-memory-fts-index.patch
407-agent-memory-distill-v1.patch
408-agent-tool-model-overrides.patch
409-agent-shed-size-order.patch
410-agent-source-marks-recap.patch
416-agent-delegate-handoff-phrase.patch
417-agent-kanban-runtime-hardening.patch
457-agent-runaway-supervisor.patch
458-agent-profile-hot-reload.patch
475-agent-shed-tiered-metrics.patch
485-agent-prefix-chain-store.patch
490-agent-unattended-approval-transport.patch
529-agent-cli-startup-fastpath.patch
533-agent-gateway-capacity-storm.patch
534-agent-gateway-outbound-notice-guard.patch
563-agent-ekko-disclosure-limits-prompt.patch
564-agent-response-delivery-fallback.patch
565-agent-ekko-tool-waterfall.patch
567-agent-ekko-mcp-tool-mode.patch
568-agent-disclosure-limits-prompt.patch
586-agent-gateway-wedged-agent-sweep.patch
587-agent-status-availability-for-all.patch
592-agent-ontology-validator-exec.patch
593-agent-per-tool-allowlist.patch
594-agent-tool-audit-ledger.patch
595-agent-usage-anomaly-watch.patch
596-agent-write-fence-roots.patch
599-agent-turn-ended-audit.patch
600-agent-assignee-realname.patch
601-agent-rule-heartbeat.patch
602-agent-session-telemetry.patch
603-agent-session-rotation.patch
604-agent-handoff-checkpoint.patch
605-agent-runaway-supervisor-wiring.patch
607-agent-kanban-guardrail-absorb.patch
609-agent-kanban-blocker-auth-degrade.patch
610-agent-redact-counter-exempt.patch
611-agent-toolsets-obs-recall.patch
612-agent-observation-pack-recall.patch
613-agent-action-fusion-then-run.patch
614-agent-evidence-reducer.patch
611-agent-session-rotation-itercap.patch
612-agent-capacity-retry-anchor.patch
620-agent-home-io-guard-read-exempt.patch
419-agent-board-concurrency-gate.patch
617-agent-0217-port-adaptations.patch
```

处置：下轮升级批逐件重定位（上游重构区：kanban 渲染器/_ctx 上下文/memory/shed）或确认上游已吸收后从 series 除名。
