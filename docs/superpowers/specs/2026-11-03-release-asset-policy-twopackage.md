# 2026-11-03 发布资产口径立法：上传面永久收窄为两包

## 变更

将 v1.0.10 发布轮的临时资产口径升级为**全局长期规则**（用户令「全局规则：以后也不再上传了，仅上传这 2 个包即可」），正本落位 `RELEASE-MANIFEST.json packaging.artifactDistribution`（local-only 旧文整体替换为 two-package-only）：

- **每版只上传 2 件**：`aistudio-full-<ver>-src.tar.gz`＋`swarm-yuan-offline-<ver>-everything.zip`（附配套 SHA256SUMS 校验件）。
- **双通道同口径**：GitHub Release 挂 2 资产；ModelScope（ollama 仓）`aistudio/` 只换 full 包＋仓根 everything zip＋`SHA256SUMS-v<版本>.txt`，旧版本保留。
- **四模块源码包（cockpit/agent-teams/ycode/yuan-skill）与 DMG/zip 构建物不再上传任何远端**，仅本地构建留存；存量远端资产（v1.0.9 及以前）保留不删。

## 决策记录

- **D1（打包流程不收窄）**：`make-release-packages` 全量 5 包打包流程保持不变——它同时是 manifest 对账（release:check）与模块完整性留存的载体；用户令收窄的是「上传面」不是「打包面」。若后续嫌打包耗时，再单独立项收窄脚本。
- **D2（模块版本载体照常进位）**：上传面收窄不改变版本纪律——模块内容实质变更时 manifest/版本节仍进位（如本轮 cockpit studio.9 声明前进），防将来以旧版本名打出内容不同的包。
- **D3（存量不删）**：「以后也不再上传」只约束未来动作；GitHub/ModelScope 已发布的旧资产默认保留（远端资产删除是破坏性动作，须用户明示）。

## 验证

- `RELEASE-MANIFEST.json` JSON 合法性校验过；`npm run release:check` 四模块对账全绿。
- A.1 登记 499→500 三处一致（标题计数＋覆盖行＋表格行）。

## 设计文档影响

**DESIGN_SYNC: none** —— 发布口径字段的文本立法，不触及整合正本/数字总账机制性内容；A.1 索引随批机械登记（附件计数）。
