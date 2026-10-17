# 术语覆盖与启动语言切换时序修复（spec）

日期：2026-10-17
分支：`fix/i18n-override-order`
来源：内容减负批合入后，8649 实机仍显示注意力条英文标签「swarm kanban」，而同一代码在 8651 冷启动实例上正常。诊断确认是运行时术语覆盖与启动语言切换的竞态。

## 根因

`registries/client/entry.mts` 在模块顶部、无语言偏好时异步调用 `switchLocale('zh')`。上游 `switchLocale` 在目标语言尚未进入 `availableLocales` 时会执行 `setLocaleMessage('zh', 新词条树)`，重建整棵 zh 词条。`i18nInstalled` 中的 `applyIa2TermOverrides(i18n)` 若先完成，随后到达的重建会把覆盖值抹掉。初始语言由系统语言决定（如 en），首次启动无偏好时必然触发切换，因此该竞态在真实环境可稳定复现；8651 因冷启动时序不同偶发正常。

## 变更

1. `entry.mts`：把启动语言切换的 Promise 记为 `localeReady`（无切换时立即完成）。
2. `i18nInstalled`：`app.use(i18n)` 之后 `await localeReady`，再动态导入并应用术语覆盖。语言切换失败时 `.catch(() => undefined)` 不阻塞挂载（与原 `void` 忽略拒绝的语义一致）。
3. `entry-boot-order.test.ts`：新增源码顺序断言——`localeReady` 赋值存在、`await localeReady` 在 `applyIa2TermOverrides(i18n)` 之前。

## 决策记录

1. **在 entry 等待，不改上游 `switchLocale`**：`i18n/index.ts` 是上游文件，按工作区规则不直接改；等待点放在 overlay 入口，职责清晰。
2. **保留失败不阻塞**：语言切换失败时仍挂载应用并应用覆盖，避免为一次词条加载失败阻断整个界面；原代码也是忽略拒绝。
3. **源码顺序测试而非时序单测**：竞态依赖浏览器启动顺序，单测难以稳定复现；钉住「等待在覆盖之前」的源码顺序，配合实机走查即可防回归。

## 验证

- `npx vitest run custom/client/ia2/__tests__/entry-boot-order.test.ts`：4/4 通过。
- 8651 冷启动实机：注意力条显示「看板」；修复前同一实例的启动竞态会显示「swarm kanban」。
- 合并后重启 8649 复验同一断言。
