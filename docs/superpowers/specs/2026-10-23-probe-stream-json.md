# 自动探测证据通道根治：stream-json 优先＋trace 后备（2026-10-23）

## 背景

挂账清偿批（spec: 2026-10-23-rrsi-gap-closure.md）live 复验 hw-001 自动探测：spawn
已成功（stderr 透传＋重试生效），但报「未产生 trace」。继续排查发现根因更深一层：
**当前 hermes CLI（0.22.4）根本不落 jsonl trace 文件**——`readNewestTrace` 期望的
`HERMES_RUN_TRACE_DIR` 通道在 CLI 侧已不存在（版本漂移，隔离运行后真实 traces 目录与
隔离目录均无新 jsonl）。而 CLI 实有 `--format stream-json`，实测 `result` 事件携带
终文本/session_id/tokens/duration_ms 全量证据信息。

## 改动

- `defaultSpawnRun` 追加 `--format stream-json` 并捕获 stdout（`SpawnRunResult` 增
  `stdout?` 字段；maxBuffer 提至 8MB）。
- 新增 `evidenceFromStreamJson()`：解析 stdout 中最后一个 `result` 事件 →
  `Evidence{transcript, efficiency{tokens, durationMs}}`（无成本价目不造数，沿用
  估值记账口径）。
- `runProbeTasks` 证据双通道：stream-json stdout 优先；无 stdout（旧形态/注入测试）
  回退 jsonl trace 读取；两通道全空 → 「未产生证据」如实报错。
- 既有注入式测试不破坏（fakeTraceSpawn 无 stdout → 走 trace 后备照常成样）。

## 决策记录

- **2026-10-23 · live 复验实证**：隔离机制与 spawn 均正常，缺的是证据回采通道——
  不改物化算法、不改隔离形态，只把证据通道对齐 CLI 现实（stream-json），trace 读取
  保留为后备兼容旧版。
- stream-json 的 `tokens.total` 是含 cache 读的口径，与 trace usage 同源；成本仍走
  价目表换算（`efficiency.costUsd` 缺席时按估值记账并计入 estimatedTasks，纪律不变）。
- 诊断链条（stderr 透传→复跑→真机实验定位通道漂移）全部过程留痕于走查记录，本 spec
  为决策正本。

## 验证

- 单测：stream-json 解析/成样/无 stdout 回退 trace/双通道全空四分支；全套件 110/110。
- server 同款 strict tsc 零错。
- live：hw-001 重跑自动探测预期出真实证据样本（随后续走查验证）。
