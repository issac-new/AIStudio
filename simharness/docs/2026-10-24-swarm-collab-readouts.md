# 群体协作四维度读数接线（2026-10-24 多 Agent 群体协作评测基准吸收轮）

- 日期：2026-10-24
- 源文：《多 Agent 群体协作的评测基准设计方法》（银翼AI评测室，2026-10-24，https://mp.weixin.qq.com/s/HmpSLcKRSd8Xr6b9RMFTpQ）
- 正本 spec：`overlay/docs/superpowers/specs/2026-10-24-swarm-eval-benchmark-absorption.md`（D1-D9 决策记录在彼处，本文只记本仓接线面）
- 分支：simharness `feat/swarm-eval-absorption`（自 main=cd7d892 起）

## 本仓改动（三处接线＋守门）

1. `mux/mx-eval-lib.sh eval_collect`：增采集 `GET /api/hermes/delivery/swarm-collab?run=$RUN_ID` → `evidence/evals/swarm-collab.json`（fail-soft 静默，缺席只不呈现不记问题单）。
2. `mux/mx-eval-summary.py`：payload 增 `swarmCollab` 透传键；判据面（fails/gaps）零改动。
3. `mux/mx-report-gen.py`：证据八表增「群体协作读数」行（MOR 字符口径/锚点保真/回灌代偿/任务完成/帕累托前沿/UAT 无条件通过率/G5 打回/拜占庭 no_data）。
4. `tests/swarm-collab-integration.test.ts`：结构守门（三处接线在位＋判据面无 swarm 字样）＋透传不改判双形态用例。

## 决策记录（与正本 spec 对账）

- 度量逻辑不在本仓实现（正本 D1）：单一事实源=overlay `custom/server/delivery/swarm-collab.ts`，本仓沿用「调端点→落证据→机械判据」定位（mx-eval-lib.sh 头注纪律）。
- 只透传不进判据（正本 D2）：退出码/G4-E 判据/六闸/26 步零改动；与 V8.46/V8.48 观察纪律同款。
- 判据面无 swarm 字样由守门测试锁定（防后续误把观测读数写进门禁）。

## 验证

- `npx vitest run tests/swarm-collab-integration.test.ts tests/eval-fullflow-integration.test.ts` → 16/16 通过。
- bash -n / py_compile 三脚本语法门通过（守门测试内含）。

## 挂账（待专门 run / 后续轮）

- 实验性 Leave-One-Out 消融、拜占庭行为级注入、混合动机场景、消息全文采集进 r18（dialog 模式启用）、per-profile token 分桶——均见正本 spec 挂账节。
