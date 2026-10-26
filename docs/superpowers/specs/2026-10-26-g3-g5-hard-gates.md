# G3 委托双证与 G5 strict 真实人工门（2026-10-26，Task 6）

分支：`fix/core-coding-chain-v2`

## 变更

九段架构第 7/9 点的推演侧收口：编码链证据从"日志存在"升级为"机器回执成立"；发布人工门在 strict 姿态下不再由驱动代批。

1. **G3 编码委托双证**（`simharness/aipay-scenario.sh` devimpl 段，`MX_ACP_BACKEND=1` 时）：在 `materials/delegate-log.txt`（人读指纹）之外，要求 `materials/delegate-result.json`（Task 4B 机器回执）存在且 `"exit": 0`、`"stopReason": "end_turn"`——缺任一、非零退出或非 end_turn 均记问题单并计入 `_g3_miss`（走既有补证等待链，超时落 `g3_evidence_gap` 显形）。消费 V8.54 §5.4.3 已立的"编码委托证据位"。
2. **G5 人工门按姿态分流**（`g5_pass_finalize`）：
   - strict：驱动不再自写批准行；等待 approved.events 出现 `humangate:<card>` 行（来源=产品 HumanGate 收件箱真人裁决写 HUMAN_GATE_EVENTS，或人工直接追加）。`MX_G5_HUMANGATE_WAIT`（缺省 900s）超时→记 `g5-humangate-timeout` 问题单、不置 `g5_ready` 并 return 1——后续 release 步按缺闸如实失败，不装绿。
   - standard/demo：维持代批效率，但批准行 actor 由 `director-human` 改为 **`director-proxy`** 并记 `g5-humangate-proxy` 问题单——净额口径可机械扣除代批，不再让代批冒充真人。
   - 发布门台账 note 注明姿态与批准来源。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | G3 消费 delegate-result.json 而非只看日志 | 机器回执含 exit/stopReason/cwd/engine，grep 可判；存在性检查曾把"文件在=过闸"当证据（run20 同型教训） | 继续只查日志（否决：非零退出的日志也存在） | 是 |
| D2 | strict 等真实批准、超时不置 g5_ready | 人为主（第 9 点）在 strict 的唯一诚实实现；缺闸失败可见可复盘 | 继续代写 director-human（否决：伪造人证） | 是 |
| D3 | standard 代批改名 director-proxy 并记问题单 | 保推演效率同时让净额口径可机械区分真人/代批 | 禁止 standard 代批（否决：现状推演全停摆） | 是 |
| D4 | 等待通道用 approved.events 行而非直查产品 API | 产品/驱动双通道已有 approved.events 对账惯例；strict 人工可在收件箱或手工追加两路落同一文件 | 驱动轮询产品 REST（否决：引入鉴权耦合，且产品不在线时 strict 永假败） | 是 |

## 设计文档影响

DESIGN_SYNC: none —— 全流程方案 V8.54（main f5113d944）已立 §5.4.3 编码委托证据位与判据框架，本批是 harness 侧消费实现；G5 strict 语义是方案 §1.5 双态声明（strict=零代偿）的既有口径落地，不改判据文本。

## 验证

- `bash -n simharness/aipay-scenario.sh` 通过。
- `npx vitest run --root simharness tests/harness-gate-integrity.test.ts`：120 过 / 8 败——**8 败为基线既有**（暂存本改动后对照同败；含 patch 586 改号引用、V8.2 四段式静态守门、runtime 564 回归锚等 main 主干线演进的守门漂移），与本批无关，未修不瞒报。
- 静态守门 `G5-HUMANGATE-APPROVED` 包含性仍满足（standard 路径保留该行）。
- 未验证项：整轮推演实证（本轮不起 run，属冻结面验证）；strict 等待环与产品 HumanGate 收件箱的真实联动（需 HUMAN_GATE_EVENTS 在 SIM studio 侧接线，列入下一轮 prelaunch 检查项建议）。
