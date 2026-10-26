# hermes-studio v0.6.46 升级 实施记录(SwarmStudio 2.7)

> **Goal:** upstream 三组件同步至 GitHub 最新稳定版:hermes-studio v0.6.44 → v0.6.46(element-web v1.12.26、hermes-agent v0.20.5 复核后确认已最新,本轮不动),B 类 patch 全链迁移 + SwarmStudio 2.7 发布。

## 版本决策(2026-08-24 实测)

| 组件 | 升级前 | 最新 stable | 决策 |
|------|--------|-------------|------|
| hermes-studio | v0.6.44(2026-08-18) | **v0.6.46**(2026-08-23,GitHub Latest release) | **升级**(v1.0.0 tag 是 2026-08-16 的历史遗留,早于 v0.6.44 且不在 release 列表,不取) |
| element-web | v1.12.26 | v1.12.26 | 不动 |
| hermes-agent | v0.20.5(v2026.8.19) | v0.20.5(origin/main 领先 553 commit 但无新 release tag,不追未发版代码) | 不动 |

## 上游变更要点(v0.6.44..v0.6.46,31 commits / 291 files)

- chat.ts:reasoning effort 持久化(onSessionSettingsUpdated / setSessionReasoningEffort import)、`clearActiveSession` 开头新增 `activeSelectionSequence++`
- Message interface:`systemType` 联合类型新增 `'tool-run'`(tool runs 折叠)
- files API:Git-aware 文件树(FileListResult 新接口、listFiles 返回类型改写、FileTree.vue 新增 parseThinking/groupCompletedToolsByRun import 与 git-status 样式)
- GroupChatPanel.vue:type import 重排为多行并新增 GroupAgentPreset
- sessions-db.ts:`listSessionSummaries` 从 SQL clauses 重写为 loadAllSessions 内存过滤
- package.json/desktop 打包相关小幅演进

## patch 迁移(10 个冲突 patch 重新生成/修复)

| patch | 漂移根因 | 修复方式 |
|-------|---------|---------|
| 023-client-store-chat | import 区新增 reasoning effort 符号 | v0.6.46 基线重生成(3 hunk 语义不变:hasApiKey guard) |
| 042-desktop-rebrand-swarmstudio-pkg | version 上下文 0.6.44→0.6.46 | v0.6.46 基线重生成(重品牌 4 处不变) |
| 089-chat-store-unread-tracking | hunk3 尾上下文缺 `activeSelectionSequence++` | 补尾上下文行 + 计数 7→8/49→50 |
| 094-client-store-chat-gateway-notice | systemType 联合类型新增 'tool-run' | 重放语义('gateway' 叠加在 'tool-run' 之后) |
| 098-client-api-files-root | listFiles 返回类型改 FileListResult | 重放(root 参数叠加在新签名上,10 处函数改写) |
| 099-client-store-files-root | hunk10 尾上下文缺 `selectDirectory,` | 补尾上下文行 |
| 100-client-files-filetree-root | style 尾部新增 git-status 样式;NTree 锚漂移 | 重放(workspaceRoot watch/empty 模板/样式) |
| 101-messagelist-gateway-banner | import 区新增 parseThinking/groupCompletedToolsByRun,空行锚失效 | hunk1 重写(import 追加至新 import 之后)+ 计数修正 |
| 116-server-sessions-parent-id | listSessionSummaries 重写为内存过滤 | 重放(includeChildren 参数 + `.filter(includeChildren || !parent_session_id)`) |
| 122-groupchat-sidebar-logout | type import 单行→多行 | hunk1 尾上下文改多行起始 |

其余 128 个 patch 上下文未受影响,原样通过。

## 重构检查(上游吸收扫描)

对照 v0.6.46 pristine 检测 138 个启用 patch 的 add 行占比:**0 个被上游新吸收**——series 无需禁用/删除项,全部保留。(对照方法:patch add 行在 v0.6.46 pristine 命中率 ≥70% 且高于 v0.6.44 基线。)

## 工具与流程坑位(供下轮参考)

1. **inject.mjs 失败不留 manifest**:hermes-studio patch 失败即 `process.exit(1)`,manifest 不落盘;下轮 `--clean` fallback 会按 series 全量反转,未应用的 hermes-studio patch 反转 → `FAILED to reverse` 中断,上游卡在半应用状态。修复迭代循环:`git checkout -- . && git clean -fd`(保留 ignored 的 node_modules)后重跑 inject。
2. **`git apply -C1` 是快速分流器**:42 个静态重叠 patch 中,真实冲突仅 11 个;-C1 可再分流掉纯外围上下文漂移(本轮 7 个),剩硬冲突逐个重放。
3. **npm install 会重写上游 package-lock.json**(npm 版本行为差异,63 行删除)→ 挡 dirty-check。patch 136/137/138 注入的依赖(cron-parser/proper-lockfile/pg)装完后 lock 变脏属预期,inject 的 restoreNonPatchArtifacts 会自动还原非 patch 目标文件,但**依赖已进 node_modules**,测试/构建不受影响。
4. **batch 扫描脚本路由正则**必须 `re.search`(或 `text.match`)而非 `re.match`——`re.match` 只从头匹配,`diff --git` 头行会吃掉第一个 `--- a/` 匹配导致 agent patch 误路由。

## 已知问题(本轮登记,未修)

- `cockpit.ts:540` 的 `eventAdapter.fromLog(...)` 引用无对应导出(event-adapter.ts:136 的 `fromLog` 是模块私有函数)→ rollup `IMPORT_IS_UNDEFINED` 警告;**历史遗留**(2f59f1f 之前已存在,非本轮升级引入),触发路径未查明前不动行为,留待 cockpit 专项。

## 验证与发布

- `npm run inject`:138/138 全部应用,exit 0
- `npm test`:67 文件 / 503 tests passed + 6 skipped(补装 patch 依赖后全绿)
- `npm run build:full`:dist/client + dist/server 构建完成,tsc 类型检查通过
- `npm run build:dmg:mac`:DMG + zip → `upstream/hermes-studio/packages/desktop/release/`
- 版本:overlay `0.6.46-overlay-2.7`
- 项目规则遵守:不自动 push GitHub、构建产物不上传(2026-06-29 / 2026-07-21 规则)
