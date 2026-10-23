# IDE 四文件冲突标记热修（走查前置批）

- 日期：2026-10-23
- 状态：已落地
- 载体：`feat/ui-walkthrough-polish`（worktree `ui-polish`）

## 背景与现象

全页面走查轮发现 `/#/app/ide` 整页崩溃：vite 编译报
`custom/client/ide/i18n.ts` 含 `<<<<<<< Updated upstream` 冲突标记
（PARSE_ERROR）；修复 i18n 后又浮出
`IdeChatPane.vue:1025 Element is missing end tag`。IDE 全家族页面在
origin/main 上不可用。

## 根因

坏提交 `483ee8a1`（「spec D20 随批」）在 stash pop 未解决冲突的状态下
`git add -A` 提交，把 4 个 IDE 文件的冲突标记直接推上 main：

- `custom/client/ide/i18n.ts`（+8 行，全为标记与 stash 侧旧文案）
- `custom/client/ide/views/IdeChatPane.vue`（+44 行）
- `custom/client/ide/components/IdePermissionSwitcher.vue`（+55 行）
- `custom/client/ide/__tests__/input-model-button.test.ts`（+112 行）

该提交的真实意图改动只有 `custom/server/delivery/maturity.ts` 的
gapNote 文案 2 行与两个 spec 文档，均保留不动。

## 冲突侧语义判定

stash 侧内容为 2026-10-18 前后的旧实现残留（声明式 CUA：开关只向会话
发声明消息、旧版 IdePermissionSwitcher 组件全文）；Updated upstream 侧
为后续「电脑操作接引擎」轮（origin/main 994c07d3 一线）的真实接线版
（会话级闸门 + fail-closed 文案 + CU 插件通道）。两侧时间戳与实现代际
明确，取 Updated upstream 侧（即 `483ee8a1^` 版本）。

## 修复

四文件统一 `git checkout 483ee8a1^ -- <file>` 恢复父版本；全树
`git grep '<<<<<<< Updated upstream'` 归零。

## 验证

- IDE 家族 vitest：125 文件 / 777 测试全绿（29s）
- 8651 临时 vite（ui-polish 树）打开 `/#/app/ide` 编译通过、页面渲染

## 决策记录

1. **修复方式取父版本而非手工逐块合并**：483ee8a1 对四文件的 diff 经
   逐文件核对全部为冲突标记与 stash 侧旧内容，无第三类实质改动，
   恢复父版本即语义正确的合并结果，且避免手工合并引入新错。
2. **热修独立成批优先推送**：IDE 全家族 500 属线上阻断级缺陷，先于
   走查优化批落 main，防止并行会话基于坏态继续叠提交。
3. **主树 UU 现场不动**：主树四文件 UU 是并行会话解决同一冲突的在途
   现场，本批从 origin/main 侧根治并推送后，其 rebase/merge 自然消解。
