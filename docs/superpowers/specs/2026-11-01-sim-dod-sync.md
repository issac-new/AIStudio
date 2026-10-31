# 全流程推演方案×程序同步：完成契约门接线（§2.6.12）

日期：2026-11-01
状态：implemented
触发：用户令「同步调整更新全流程推演方案及程序」——前夜完成契约体系（内核门＋会话接线＋血统收回，main 8d9c22460/960010471）与 SIM 全量刷新（run24 暂停-刷新-续跑实操定型）落地后，方案与推演程序需对齐收口。

## 变更

- **方案**（`2026-10-05-mux-v8-fullflow-plan.md`）：§2.6 治理机制族新增 **§2.6.12 完成契约门（执行层第零道锁）**——机制一句话、契约生成（派发瞬间冻进 kanban_json）、内核校验（complete_task 边界·证据重算·拒绝事件·自愈重试）、激活开关 `MX_DOD_CONTRACT=1`（缺省 0＝零行为变化，run25+ 起跑 env 显式开启、run24 续跑段不受影响）、与 G1-G6 的分工（管「卡能不能关」不管「交付物合不合格」）、部署通道顺序约束。G1-G6 冻结判据零改动。
- **程序①**（`simharness/mux/mx-up.sh`）：刷新顺序根治为 provision→patch→deploy（原 deploy 在前，快照重供会洗掉部署内容且宿主未跟踪新文件只能靠 manifest 补位——run24 刷新窗实锤的坑，注释同步改写）。
- **程序②**（`simharness/mux/mx-scenario-lib.sh`）：`kanban_create_as` 增 `MX_DOD_CONTRACT` 开关（缺省 0）——开后导演建卡 body 尾部并入 `_dod_contract_suffix`（两条 AC＋receipt 写法指引），内核完成门随之对该卡生效。
- **程序③**（`simharness/mux/deploy-window-runbook.sh`）：步骤 C 从逐文件 cp 仓外旧兄弟 upstream 树（单仓整合后路径已失效＝静默跳过）改为 `deploy-agent-runtime --apply --runtime` manifest 通道（与 mx-up 自愈同源）。
- **守门**（`simharness/tests/harness-gate-integrity.test.ts` 新 describe ㉖，五断言）：mx-up 顺序锁死、开关缺省关＋AC 段行为面（真库 source 渲染出两行 AC）、runbook 禁旧路径字样、方案 §2.6.12 对齐锚在案、产品面契约五件在位（completion_contract/内核门/会话接线/CLI --receipt/派发 env）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 开关缺省关，run25+ 显式开 | run24 在途（驱动存活），建卡模板若立即带 AC＝剩余步骤的卡全被门拦而 agent 无回执认知＝run 停摆 | 立即默认开（否决：在途轮不可承受行为翻转） | 是（起跑 env） |
| D2 | AC 段写入 mx-scenario-lib（建卡单点）而非 aipay-scenario | aipay-scenario.sh 是在跑驱动本体（bash 惰性读文件，盘中改＝执行错位风险）；scenario-lib 已被 source 进内存＝改盘安全，且新拉驱动重 source 时拿到新版 | 改 aipay-scenario（否决：运行中脚本不可编辑） | 是 |
| D3 | 方案只加 §2.6.12 不动 G1-G6 判据 | 判据冻结面纪律（v8.x 多轮先例：机制族增长、判据零变化）；完成契约是执行层新锁不是闸改写 | 改写 G3/G4 判据纳入回执（否决：冻结面 + 语义分层不同） | 是 |
| D4 | mx-up deploy 收尾而非删除（快照已含跟踪态） | manifest 是未跟踪新文件的唯一补位通道＋内容级对账面；三步幂等零副作用 | 删 deploy 步（否决：completion_contract 类新文件将随刷新消失） | 是 |
| D5 | runbook 换通道而非修路径 | 旧路径指向已退役本地缓存（existence 不保证）；manifest 通道＝仓内正本、与 mx-up 同源幂等 | 改指 vendor/hermes-agent（否决：绕过 manifest 的内容级对账，双通道漂移） | 是 |

## 验证

- `npx vitest run simharness/tests/harness-gate-integrity.test.ts` → **117 passed**（含新 ㉖ 五断言；AC 段行为面在隔离 SIM_ROOT 真 source 两库渲染实测）。
- `bash tests/run-gates.sh` → **ALL-PASS**（shell 门族全绿）。
- `bash -n` 三脚本语法通过。
- 诚实边界：`MX_DOD_CONTRACT=1` 的全链激活（建卡→派发→worker 回执→内核门）尚未在整轮推演上实测——run25 起跑开启后首验；绊线已锁「开即有效」的静态面。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md`：§2.6.12（本批正身）。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：本 spec 登记（446→447）。
