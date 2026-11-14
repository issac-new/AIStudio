# run30 前置行动台账（2026-11-12 立；run29 复盘行动项 A1-A6）

> 唯一事实源：run30 开跑前逐项核对本表。来源=`2026-11-12-run29-full-retrospective.md` 第五节。状态三态：✅ 已落地（代码/文档在位）／⏳ 待执行（run 内生效）／🔒 待裁决（用户决定）。

## 一、行动项

| 编号 | 行动 | 状态 | 落点与验收判据 |
|---|---|---|---|
| A1 | director 派发折中处置：默认 preset；标定轮显式开 director；开启时带「无容量即时声明降级」通道与成功率指标 | ✅ | `mx-scenario-lib.sh`：派发正文含 `DIRECTOR-DEGRADED reason=`；等待用双信号（派发/@执行者 或 降级声明）；`evidence/director-metrics.jsonl` 逐次留档（outcome/reason/elapsed_s）。判据：director 轮报告能给出 success 与 degraded(declared/timeout) 计数 |
| A2 | 确定性失败二段式（首次自动重挂＋告警，二次才停） | ✅ | `run-driver-supervisor.sh`：`mx_storm_decision` 纯函数＋`mx_alert`/`mx_issue_once`；第 1 段 60 秒退避重挂并写 `alerts.jsonl`＋`driver-deterministic-stage1`，第 2 段 `driver-deterministic-fail` 停止。判据：故障注入下第一次自动恢复、第二次停止且告警在案 |
| A3 | 审计收敛纪律：全量清单一次处置完再复扫 | ✅ | 方案 §5.13 第 7 条；驱动审计 FAIL 时生成 `evidence/audit-fix-checklist.md`（分族计数＋全量条目）。判据：下一轮审计 FAIL 轮次 ≤3 |
| A4 | UAT 记账噪音收敛：条件验收为终态、三类记单幂等 | ✅ | `aipay-scenario.sh`：步守卫加 `uat_conditional` 终态条件（run29 重入 25 次的主因）；`uat-conditional`/`uat-push`/`uat-cond-proxy` 改 `issue_once`。判据：UAT 步 issues 行数 ≤10（run29 为 66） |
| A5 | vendor 四条已知限制对拍 | 🔒 | 见第二节；需在 0.23.x 后续版本或补丁评审时逐条实测，不盲改 vendor |
| A6 | 状态键判读行首锚定 | ✅ | `mx_done_key_count` 单一实现（行首锚定＋排除 `capture_ok_*`）；烧机收据改用同口径（run29 收据 done 键 21 vs 真实主步 13）。判据：守门测试 `run30-actions.test.sh` 常驻绿 |

## 二、vendor 侧对拍清单（A5，逐条实测，不盲改）

| # | 已知限制（run29 实证） | 对拍方法 | 若复现的处置方向 |
|---|---|---|---|
| V1 | 评审结论只写任务完成摘要，`result` 字段空、不回房间 | 任一评审 Agent 完成任务后查 `tasks.result` 与房间消息 | 判定通道已加第三读取面（完成摘要）；vendor 修复前不再依赖 result |
| V2 | 深度评审判词产出 >600 秒（架构评审单轮 40 分钟级） | 观察 `agent.log` 该回合工具轮数与跨度 | 等待窗按实测标定（改常量），不压低评审质量 |
| V3 | 复评重派后 Agent 迟滞 40+ 分钟无回合 | 重派后计首次真做时间 | 由 N29-15 真做判活触发自动催办；仍迟滞则提 vendor 工单 |
| V4 | 派发通道队列挤压（总监派发 46/51 次超时） | `director-metrics.jsonl` 的 reason 分布 | 走 A1 声明式降级；director 成功率进报告指标行 |

## 三、run30 开跑门（额外三项，其余沿用 mx-prelaunch-check）

| # | 检查 | 判据 |
|---|---|---|
| G-a | 派发模式显式声明 | 命令行显式给 `MX_DISPATCH_MODE`（不设=preset）；director 轮须在开跑通报中写明「标定轮」 |
| G-b | 中央裸仓无 worktree 占持 main/integration | `git --git-dir=<central-origin.git> worktree list` 无 main/integration 检出者 |
| G-c | 状态键判读口径 | 值守脚本/巡检命令一律 `^key=` 锚定；`run30-actions.test.sh` 绿 |

## 决策记录

| # | 决策 | 备选与否决理由 |
|---|---|---|
| D1 | director 采用折中（默认 preset＋标定轮开启），不直接退役也不无条件修复 | run29 成功样本 5 次全在低负载段，不足以支撑「窗口调大即可」；退役则 O7 永久沉没 |
| D2 | vendor 四条只对拍不盲改 | 四条均为运行期涌现行为，无稳定复现路径；盲改回合逻辑风险高于收益 |
| D3 | UAT 记账按「终态守卫＋幂等记单」修，不合并问题单文本 | 真因是重入重跑（25 次），不是文案合并；修根因后行数自然回落 |

## 验证

- `bash simharness/tests/run30-actions.test.sh`——A1/A2/A4/A6 全绿（含二段式三态、计数排除副键、指标行形状、守卫与幂等断言）。
- `bash simharness/tests/run-gates.sh` 全绿；`bash -n` 三个改动脚本过。
- A3 清单生成：审计失败路径调用 `_mx_audit_checklist`，python 语法与分族聚合在失败夹具上验证（见批次 spec 验证段）。

## 设计文档影响

DESIGN_SYNC: none——本表是 run30 执行台账，不触及 DESIGN_DOCS 四正本；可执行条款已随批入方案 §5.13 第 7-9 条。

## 四、起跑时间学（2026-11-14 增补，G-d：run30 实测凌晨深睡 3h 教训）

| # | 检查 | 判据 |
|---|---|---|
| G-d | 起跑窗口避开凌晨 | 起跑选 09:00-11:00 窗——26 步全程落日间活跃段；G2/尾段（第 8-14 小时）避开 00:00-07:00 凌晨深睡窗（run30 实测：凌晨段 agent 群体零交付 3h、在线工位=1；run30 17:00 起跑致 G2 三轮环 4h36m 全落深夜） |
