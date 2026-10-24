# R101 spec-first 强拦截通用轮（2026-10-09，v2.64.0）

> 触发：R98 留档第 1 项——「5 个无 hook 宿主（Cursor/Windsurf/Gemini 等）spec-first 强拦截缺失，独立设计轮」。「无 spec 写源码」此前只在 Claude Code（hooks deny JSON）与 Codex（exit 2）两个有 hook 机制的宿主有写时强拦，其余宿主只有 advisory 规则文件——拦截能力与宿主 hook 绑定，即 R98 主题（与具体工具绑定的能力耦合）的残留缺口。

## 一、设计：四层拦截模型

判据单一事实源 `spec-first-lib.sh`（spf_* 五函数），四层按宿主能力自动组合：

| 层 | 时点 | 载体 | 覆盖 | 状态 |
|---|---|---|---|---|
| L1 写时 | Write/Edit 前 | 宿主 hooks deny | Claude Code、Codex、ZCode | 前两既有；ZCode 本轮接线 |
| L2 提交时 | git commit 前 | pre-commit（core.hooksPath=.swarm-yuan/hooks） | 全部 8 宿主（宿主无关） | 本轮新增 |
| L3 门禁时 | precheck 序列 | check_spec_first（入 ALL_GATES_CORE） | 全部宿主 | 本轮新增 |
| L4 流程准入 | build 阶段转换 | state-machine guard build | 全部宿主 | 既有 |

选型理由：无 hook 宿主的真实强制点只有两个不依赖宿主的地方——版本控制（git pre-commit，exit 1=真拒绝）与技能自身执行面（precheck 序列，⑥⑦⑧节点全绿才走）。L2/L3 全覆盖后，L1 是有 hook 宿主的纵深提前量而非必要条件；诚实降级线（gstack 先例 "advisory, not blocked"）向无 L1 宿主明示强制时点。`--no-verify` 逃生门是 git 标准机制，披露在拒绝消息里，由 L3/L4 兜底。

## 二、ZCode L1 接线的五条活体实证（2026-10-09，zcode.cjs 0.16.9 无头会话）

1. **插件面 deny 协议成立**：hooks/hooks.json 用嵌套形态 `{"matcher": M, "hooks": [{"type": "command", "command": C}]}`，hook stdout 输出 `{"hookSpecificOutput":{...,"permissionDecision":"deny",...}}` → 工具调用被硬拦（不执行、模型收到 reason + additionalContext 全文）。端到端验证：真实 fail-gate-hook.sh（含本轮判定库）经插件注册后，ZCode 无头会话中对受 WRITABLE_DIRS 保护项目的 Write 被拒、文件未创建、gate-audit.jsonl 落盘。
2. **扁平形态被静默丢弃**：`{"matcher": M, "command": C}`（生成物 hooks/hooks.json 现行 Claude 形态）注册后 `plugins list` 计 hooks: 0，零报错——与 Codex 回归 #23（serde 静默丢字段）完全同型的第三宿主复现。此坑是「活体实证先行」立场的直接回报：按 schema 相似直接接线就会静默失效。
3. **插件目录须含 manifest**：`.zcode-plugin/plugin.json`（`.claude-plugin/plugin.json` 亦被接受）；裸目录注册后被静默忽略（hooks: 0）。
4. **注册面只有用户级**：`~/.zcode/cli/config.json` 的 `plugins.dirs`；无项目级 hooks 发现路径。fail-gate-hook 按 cwd/conf 三级解析自限，未配置项目零干扰，故用户级注册不越界。
5. **config.json hooks.events 直挂钩子不构成强拦**：PreToolUse 钩子输出 deny JSON 只被降级为建议（reason 注入工具结果、调用照常执行）——勿走该通道。

接线形态（zcode.sh render_tool_zcode_hooks）：`<skill>/zcode-plugin/` 独立插件目录（manifest + 嵌套 hooks.json + 绝对路径直调 fail-gate-hook），不动 Claude Code 侧 hooks/hooks.json；config.json 幂等注册（python3 原子写，缺失降级披露）。项目级渲染才注册（与 codex 适配器同界），AGENTS.md 标记区块 fail-closed 短路优先（态5 锁）。

## 三、判据收敛（第三次复制前先收敛）

spec 判定此前两处复制：fail-gate-hook 内联三段（SPEC_REQUIRED 自引用默认解析 / WRITABLE_DIRS 括号剥离 / 已批准 spec 环）与 state-machine build 准入审批环——R36-D10、R75-D3 两轮缺陷都修在同一判据上，复制面即回归面。本轮抽 `spec-first-lib.sh` 五函数（解析链逐字节对齐原内联版；`<占位符>` 剥离保留在 state-machine 包装层，保证 fail-gate-hook 行为零变化），既有锁测试（test-fail-gate-hook 35 态、test-state-machine）零修改全绿（夹具补随拷判定库，对齐生成物成套布局）。L2/L3/L4 新消费方全部走库——四处消费一份判据。

## 四、门禁预算修订（决策 26.2 例外登记）

FACT_GATES_BUDGET 冻结值 55→56：check_spec_first 是无 hook 宿主（5/8 宿主）spec-first 强拦截在门禁面的唯一承载，属拦截通用化的功能本体，非门禁蔓延。修订三处留痕：本档、facts.conf 键注记、CHANGELOG v2.64.0。仍冻结于 56，不构成先例。

## 五、留待后续

- 生成物 hooks/hooks.json 的扁平形态（Claude 面）是否被 Claude Code 宿主静默丢弃（同本轮实证②的怀疑，未在 Claude Code 活体验证）——若坐实，影响面是 Claude 宿主 L1 有效性，独立小轮处理。【已销项：坐实为真 bug，R102 改嵌套形态+机器锁，见 R102 §一】
- 5 无 hook 宿主 2026-07 基线后的 hook 能力复核（Cursor/OpenCode 生态变化快）——本轮只按现状渲染降级线，接线留独立轮。【已销项：复核完成，五家 hook 通道均在册（4 家基线漏判+Kimi 产品更替），基线更正，接线留新轮，见 R102 §二/§五】
- **软链部署下 self-check 环境性误报**（收口部署时发现，非本轮回归——R101 前的物理安装备份同代码 dotnet 双态通过，实证为布局差异）：`~/.zcode/skills/swarm-yuan` 经软链指向 `~/.cc-switch/...` 时，framework fixture 的 `__REPO_ROOT__` 替换为技能父目录，precheck 启动 cd 到 PROJECT_DIR 后 `find .` 不下钻符号链接（find 默认不穿链）——fw_dotnet_nullable 的 csproj 兜底失明、合规侧误报（81 框架中仅 dotnet 受累，因仅它走 `find .` csproj 兜底）。附带同性质提示：部署副本无 `../.github/workflows/ci.yml`（repo 布局专属，warn）。影响面=软链部署副本的 self-check 报「部分未通过」，仓内 run-sweep/verifier/release 门不受影响。候选修法（独立小轮，须过 81 框架 fixture 全矩阵防回归）：csproj 兜底改为沿 srcarr 来源目录共址搜索（语义收紧，兼修 fixture 语料隔离的潜在越界），或 find 加 -L。【已销项：R102 双通道修复（上溯+子树）+CI 对账三分支+install 排除 ci/，81 矩阵 81/0，见 R102 §三】

## 六、验证

- run-sweep 59/0 全绿（含 test-r101 新增 30+ 断言、test-r68 受控语言、gen-e2e 预算、verifier all、self-check）；shellcheck 零 error（verifier 层 SHELLCHECK_ERRORS 0）。
- 部署刷新三处：~/.claude 安装 + ~/.cc-switch 同步 + ~/.zcode 软链；新件（spec-first-lib.sh / spec-first-pre-commit.sh / fail-gate-hook.sh）三处可达。
- 部署副本 self-check rc=1 两处 warn 均为软链布局环境性误报（§五 第三条，含 R101 前物理备份对照实证）——非代码回归，仓内验证门不受影响。
