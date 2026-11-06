# 2026-11-06 run27 设计优化批 O1-O6 落地（用户裁决「豁免放行＋全做」）

## 变更

用户裁决：A 案豁免放行（94 笔代偿 waive）＋七项设计优化全做。本批落地六项，O7（派发权移交总监角色 PR-7）为产品面大改造挂账下轮。

- **豁免执行**：`mx-compensation-ledger.sh` 新增 `waive-open <理由>` 批量豁免命令（逐笔落 waive＋用户裁决理由，审计可追溯）；run27 的 94 笔 open 已豁免，清偿门复验 ✓（run28 可开）。
- **O3 帧采集四态根治**（用户红线「截图务必准确，不要冒充」）：
  - `capture_step` **拍后即验**：前后帧 md5 相同 → 帧隔离 `.invalid` 不入证据池、capture_ok 不置位（重放可换位重拍）、记 `frame-zero-change-voided` 单——run27 实锤 19 步零变化帧全部按「实拍」入了报告证据池，从此结构性杜绝。
  - `capture-plan.env` **17 个弱承载步重分类**：10 步 `none`（真值在 state/API/消息转录，如 smoke/login/g1_frozen/room/dispatch/report_done）＋7 步 `repo`（产物证据型，真值=git 文档/kanban 卡，如 analysis/g2_arch_pass/devimpl_done/release/retro/workmgr）；真承载步（ide/eval/testpass/report_view/uat/audit 等）保留 ui 位。
  - **repo 型新语法**：不拍截图（拍出来必是冒充帧），采集产物证据（中央仓本轮提交窗＋state 终值）落 `evidence/repo-shots/<step>.md`＋r18 op 记录，报告按产物证据呈现。
- **O1 指标留档**：报告生成后核心指标（时长/六闸时刻/问题单四数/代偿三数/帧三数）追加仓内 `docs/governance/run-metrics.jsonl`——run 产物可清、指标不灭，「并行度连续两轮低于基线」类证伪判据从此可测。
- **O2 修复率披露断言**（渐进式）：审计器 FAIL 级强制报告呈现「修复率（已修÷唯一键）」行（缺=口径失真）；数值下限（MX_FIX_RATE_MIN）留闸语义变更，下轮裁决后可升级硬拦。
- **O4 证据豁免显式化**：`NO_DIALOG_STEPS={2,4}`（配置初始化/环境冒烟——无 agent 交互面）在生成器与审计器同源声明，r18 缺对话从「看起来合理」变为「声明豁免」。
- **O5 口径时点标注**：台账事件流 note 标注「口径时点=报告生成时刻；G6 与 report 段之间 DISP 归桶仍在推进」——retro 文档引用事件流计数须标冻结时点。
- **O6 缺陷修复契约强化**：5 处测试任务派发模板追加「FIX-DONE 须附 fei 复测签名（FE 侧）；单项超 30 迭代未竟即先交付已完成部分并如实报进度（禁 60 迭代烧尽零提交——run27 xiao 实锤）」。
- 守门 `tests/frame-four-state.test.ts` 6 面（拍后即验行为/函数接线/17 步分类/真承载保留/理由非空/repo 分支顺序）。

## 决策记录

- **豁免用 waive 不用 resolve**：resolve 语义=对应 PR 已落码合入（本批未做 PR-7）；waive=用户显式裁决豁免＋理由留档——不虚报清偿。
- **零变化帧「隔离不删除」**：.invalid 留盘可审计（何时拍的、为何作废），证据链不缺角。
- **重分类只动弱承载步**：run27 零变化 19 步中 17 步定 none/repo；ide_done 零变化属个案（任务 id 失效）保留 ui 位；report_view/eval_done/testpass_done 内容不符属期望词问题，修期望词不降级。
- **repo 证据=清单不是截图**：git 提交窗＋state 终值是可反查事实；不伪造「产物截图」。
- **O2 只强制披露不设下限**：闸语义变更（数值下限）须独立裁决——本批让「修复率」必须在场，下轮看数据再定线。

## 验证

- 守门 `frame-four-state.test.ts` **6/6**（含 .invalid 隔离行为复现）。
- 清偿门：waive-open 94 笔执行后 `check-clearance` ✓（run28 解锁）。
- `bash -n` 两个脚本＋`py_compile` 生成器/审计器全过；O1 留档 fail-open（异常不阻断报告）。
- capture-plan：none/repo 行 17 条全部带理由；真承载步 12+ 保留 URL 位。

## 设计文档影响

DESIGN_SYNC: none——采集/审计/报告机制加固与豁免执行，六闸判据与纪律条款未变；O2 数值下限与 O7 属后续闸语义/产品变更，独立裁决。
