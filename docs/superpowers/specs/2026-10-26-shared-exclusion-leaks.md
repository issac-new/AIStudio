# 2026-10-26 _shared 排除面审计两漏补齐（巡检日志尾 + 能力上报）

## 变更

`_shared` 排除面审计（本轮对话）结论：hermes 本体（名字正则 `^[a-z0-9]`）与 studio profiles 页（同款首字符校验）结构性排除、两处数据形状门控天然跳过、五处语义正确的有意包含；**两处真实漏排**，本批补齐：

1. **集群巡检「profile 日志尾」采集漏排**（custom/server/clusterinspector/collectors.ts collectProfiles）——无名字过滤，`_` ASCII 序在小写字母之前，`_shared` 排序最前必占 cap=40 位；其 `logs/agent.log` 实存（435 字节两条维护日志），停摆观测面出现幻影 profile 行。修复：枚举滤 `_*` 前缀（与 hermes 名字正则同款排除）。守门测试新增 collect-profiles-filter.test.ts（含 cap=1 挤位回归用例）。
2. **能力上报生成器漏排**（`_shared/ops/gen-capability-report.py`，源仓=~/.hermes/profiles/_shared git 仓，origin=hermes-shared.git）——按「有无 skills 目录」判定把 `_shared` 当 profile 上报（m5u.json 实测含 `_shared` 条目）。修复：枚举滤 `_*`；实测 50→49 条、无下划线条目。共享技能经各真 profile 的供给面呈现，不靠 _shared 冒名。

## 决策记录

- 修复面各落在其单一事实源：巡检过滤器在 AIStudio 仓 custom/（走本仓 worktree+spec 流程）；生成器在 hermes-shared 独立 git 仓（本 spec 记录跨仓改动的决策，脚本提交直接落该仓）。
- 过滤规则统一用 `_` 前缀（与 hermes PROFILE_ID_RE、identity-chat、filterVisibleProfiles 的既有约定同源），不用名单硬编码。
- 不顺带改 cli-fast-gates 名册（含 _shared 但语义只是 CLI 预检存在性快答，无功能损害——审计已定性为轻微口径瑕疵，单独挂账不动）。

## 验证

- 新守门测试 2 用例 + 巡检族 39 既有用例全绿（41/41）。
- 生成器实测：真 profiles 根跑出 49 条、`_shared` 与一切 `_` 前缀零出现（改前 50 条含 _shared）。
- serve-main 换装重启后：观测面 tails 无 _shared；能力上报文件随批刷新（m5u.json 重生成）。
