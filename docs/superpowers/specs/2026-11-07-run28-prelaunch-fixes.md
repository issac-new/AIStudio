# 2026-11-07 run28 开跑前三修（通道预检直连格式 / 清偿门真首轮回归 / 帧位守门对齐）

> 来源：run28 开跑门检（mx-prelaunch-check 27 过 9 败）与烧机首跑（burn-20261107-151001 秒败）的定谳收口。三处红均非 run28 新引入，分别是三个既有批次的漏网面。

## 变更

1. **`simharness/mux/mx-lib.sh` model_preflight 增加 providers 顶层格式第三态**。SIM 直连批（2026-11-05，spec `2026-11-05-sim-direct-llm-channel.md`）把 profile 改写为 `model.provider: <裸名>` + 顶层 `providers.<name>{api, api_key, default_model, transport}` 形态，但预检解析器只认旧两种（`model.base_url` 内联 / `custom_providers[]`）→ url 解析为空 → 13 profile 全员 `unreachable` 假红，烧机 driver_rc=1 秒败。run27 未踩中系开跑（11-05 06:53）早于改写（当晚）纯属时序侥幸。新增第三态：裸名回 `providers.<名>` 取 `base_url|api`、`api_key`、`default_model|models 首键`；三态全认，旧格式不退役（宿主快照/未归一 profile 仍在用）。
2. **`simharness/mux/mx-compensation-ledger.sh` 主入口 F 解析按命令分流**。run27 复盘根治批（`2026-11-06-run27-design-gap-rootfix.md`）把清偿门改 fail-closed 时，主入口 `_mx_led_file` 失败一律 `exit 2`，导致「全仓无任何轮台账=真·首轮」的放行分支（case 内，注释明示设计意图）永不可达——mx-clean 清场后 `check-clearance` 恒 rc2，守门测试 `posture-ledger.test.sh`「无台账 → rc0」断言红。修法：主入口 F 解析失败时置空继续进 case，由各分支既有容错裁决（check-clearance 的「有历史台账但锚缺位→exit 2」fail-closed 语义原样保留；summary/list 的「台账未建→rc0」原样保留；resolve/waive/append-disp 写命令各自 `[ -f "$F" ]` 拒绝，防误操作语义不变）。
3. **`simharness/tests/r18-plan-var-expand.test.sh` ⑥ 断言对齐 run27 帧重分类**。run27 帧四态红线批（`2026-11-06-run27-design-optimizations.md`，用户裁决）把 `capture-plan.env` 的 `devimpl_done` 重分类为 `repo` 产物证据型（不再拍 IDE 页），但守门测试⑥仍要求 devimpl_done 行带 `/app/ide?task=${IDE_TASK:-` 拍摄位 → 假红。断言改为：devimpl_done 断 repo 型 + ide_done 断参数化（参数化防线语义不变，run23 陈旧任务号复发防线只关 IDE 拍摄位本身）。
4. **清偿门语义分层补齐（`check-clearance` case 内）**。夹具揭示第二层回归：run27 根治批的 fail-closed 分支条件「F 不存在 + 仓内有历史台账」会把**显式指定的无台账轮**误拒（posture 夹具 `--run runNEVER` 实证 rc2）。分层修正：run id 已定（锚或 --run）而该轮无台账=该轮零代偿，放行（跨轮债务走 var/clearance 投影由各轮自身门核，不跨轮连坐）；run id 解析失败且仓内有历史台账才 fail-closed（run27 根治语义原样保留）。
5. **jargon 门 6 处存量 HARD 违规随批改人话**（mx-report-gen.py「实算」×2、mx-report-audit.py「收口/守门/收编」、mux-v8-fullflow-plan.md「沉淀」；主树同红定谳 pre-existing，因 prelaunch ① 要求门禁套件全绿而 gate 读提交态，未清则恒红）。

### 随批收口（非代码变更）

- 主树 `docs/governance/run-metrics.jsonl` 还原本日 15:05/15:06 混入的 2 行脏数据（`run_id: 20261002-v5-run7`——mx-setup 板重建/prelaunch 时段追加器在净环境下锚到远古轮次，**源头缺陷挂账 N28-1**：run-metrics 追加器的轮次锚定在 state.env 清空后无兜底校验，写下轮前须修）。
- `.swarm-yuan/audit-samples.jsonl`（+2 治理采样）与 `.qgate/release-gate.json`（release gate 状态 failed→complete@45e419149）为当日治理运行合法产出，随批入库。

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|------|----------------|
| D1 | 预检三态全认（内联/custom_providers/providers 顶层），不退役旧格式 | 只认新格式会把宿主快照等存量形态推回本次同型假红；解析器是读面，宽容多态、探测结果才是裁决 |
| D2 | 清偿门在**主入口**分流而非把 check-clearance 内放行分支外提 | fail-closed 治理语义（有历史台账+锚缺位=拒）必须留在裁决分支内由台账事实触发；主入口提前拦截会吞噬一切 case 内语义——这正是本次回归的根因形态 |
| D3 | r18⑥ 改测试断言而非恢复 devimpl_done 的 IDE 拍摄行 | run27 用户裁决 repo 产物证据型（帧四态红线：截图不冒充）在先，测试期望是重分类前的残留；恢复旧行=倒退裁决 |

## 验证

- `bash simharness/tests/posture-ledger.test.sh`——「无台账 → rc0」恢复 PASS，清偿门三态（有 open→1 / 全清→0 / 无台账→0）全绿。
- `bash simharness/tests/r18-plan-var-expand.test.sh`——⑥ 过（devimpl_done repo 型 + ide_done 参数化双断言）。
- 净环境实测：`AIPAY_SIM_ROOT=/Users/cuishi/lab/ncwk-sim-mux bash simharness/mux/mx-compensation-ledger.sh check-clearance` → rc0「真首轮」。
- 通道预检实测：model_preflight 对 bella profile 返回 ok（providers 顶层格式解析成功；网关 venv 解释器直打 bigmodel anthropic 端点已实测 ok，type=message）。
- 烧机重跑（mx-burn-test.sh）至 archgate 达步＋新 digest 收据 pass——覆盖机制地图「闸门类改动须重烧」纪律。
- `npx vitest run custom/__tests__/docs-ssot-guard.test.ts`——附录 A 计数一致。

## 设计文档影响

DESIGN_SYNC: none——三处均 simharness 推演工装面（mux 工具解析器行为恢复设计意图＋守门测试期望对齐），不触及整合正本与数字总账；机制地图（docs/design/mechanism-map.md）无行级变更（未新增机制，烧机收据按既有纪律刷新）。
