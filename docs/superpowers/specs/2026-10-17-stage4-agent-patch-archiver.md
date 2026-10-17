# 阶段四 agent 侧补丁归档执行器（tooling）

## 背景
AIShips 退役路径（RETIREMENT-VERDICT）阶段四须将 agent 侧 45 件补丁归档停维护。执行器入库以便用户放行后一键执行；本提交仅入库脚本，不执行归档。

## 需求（AC）
- AC-1：分类单一事实源=scripts/classify-agent-patch.py（首 diff 路径前缀判定；与 2026-10-17 精确盘点同引擎，dry-run 45 件一致）。
- AC-2：archive-agent-patches.sh 缺省 dry-run 零改动；--apply 才 git mv 到 patches/archive-agent-2026-10/ 并注释 series 行；不自动 commit。
- AC-3：阶段四放行前不执行 --apply（本提交只备器）。

## 决策记录
- D1（Mechanical）：分类引擎用 python 单文件而非 shell grep/sed——字节面窗口/ERE 语义漂移实录（43/45/47/49 四次漂移），单一事实源杜绝漂移。
- D2（Mechanical）：--apply 不自动 commit——归档是退役级变更，人工核对后提交（防误伤并行会话在途补丁 645/646 类）。
