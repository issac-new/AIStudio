# 设计文档同步轮尾部清偿：PROJECT_DIR env 可覆盖 + L3 分支态验证固化

> 状态：已批准（2026-10-26 用户指令「完成所有未做事项」）
> 分支：fix/design-sync-followup（前轮 2026-10-26-dev-skill-design-doc-sync.md 的尾部批）

## 1、背景与问题

前轮立法批遗留四项，本批清偿其中需提交的一项（另三项：垃圾目录清理/serve-main 换装/doc-numbers 归属确认均无提交已毕）：

- **L3 PROJECT_DIR 硬编码**：实例 conf `PROJECT_DIR=/Users/cuishi/lab/AIStudio` 直赋形态——env 覆盖无效（source 必覆盖），worktree 分支态跑 L3 门禁永远查主仓树，「L3 分支态完整路径」只能靠 L2 同库旁证。
- **L3 design-sync 路径未验证**：前轮只验了 L2 端到端与 L3 主仓态放行；fixture 分支态的 L3 拦/放双场景没有机械验证载体。

## 2、变更

1. `skills/swarm-yuan/assets/precheck.conf`（生成器模板）：PROJECT_DIR 行改 `PROJECT_DIR="${PROJECT_DIR:-<项目根绝对路径>}"` 形态（env 可覆盖；MEASURE 注释保留；变量数不变）。
2. `skills/swarm-yuan/tests/test-design-sync.sh`：新增 ⑤ L3 端到端场景——fixture 仓拷全套脚本组（precheck.sh+gates 三聚合+spec-first-lib+conf），env PROJECT_DIR 指 fixture、cd fixture 跑 `precheck.sh --spec-first`，断言双场景（touched 未兑现 fail / 兑现后 pass）。
3. 实例 `.claude/skills/aistudio-dev/scripts/precheck.conf`：同步 env 可覆盖形态（实例不在 git，随批刷新披露）。

## 3、决策记录

| # | 决策 | 选择 | 备选 | 理由 | 类型 |
|---|---|---|---|---|---|
| D1 | PROJECT_DIR 可覆盖方式 | conf 行 `${PROJECT_DIR:-默认}` 形态（与 SPEC_REQUIRED/SPEC_GLOB 既有形态对齐） | precheck.sh 运行时自动改写 PROJECT_DIR 为 git toplevel | 后者改变主仓既有语义且动四脚本行数；前者零行为变化（不传 env 时同旧值） | Mechanical |
| D2 | L3 验证载体 | 固化为 test-design-sync.sh ⑤ 场景（precheck.sh --spec-first 全链） | 一次性人工 worktree 验证 | 测试可回归防复发；人工验证不可复跑 | Taste |
| D3 | 并行上限偏离 | 在途 4 个（均为并行会话 IN-FLIGHT<24h 活跃任务、不可收口）时建第 5 个短命 worktree，即刻收口并随批披露 | 阻塞等收口 | 用户显式指令「完成所有未做事项」优先；worktree 存活分钟级、负担可忽略 | UserChallenge |

## 设计文档影响

- DESIGN_SYNC: touched
  - docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md —— 文档域 specs 数 342→343（本 spec 随批 +1）；引擎域源行数不变（只改 conf 模板与测试，不触四脚本）

## 4、验证

（实施后回填）

## 5、风险与回滚

- PROJECT_DIR 形态变化对生成期填充无影响（AI 替换尖括号占位文本时保留 ${} 前缀）；不传 env 零行为变化。
- 回滚=revert 本批。
