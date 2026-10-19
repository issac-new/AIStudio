# custom/client — 客户端扩展入口

Vue 3 + TypeScript 客户端扩展层。按功能区目录：`ide/`、`ia2/`、`cockpit/`、`governance/`、`kanban/`、`matrix-chat/`。

## 关键约定

- **数据获取**：`governance/api/harness.ts` 这类 API 模块统一走 `@/api/client` 的 `request`；历史组件可用 `fetch` + `authHeaders()`（JWT 从 `hermes_api_key` 读取）。组件不直接拼后端 URL。
- **i18n**：文案放 `custom/client/governance/i18n.ts` 等域级 `i18n.ts`，中英成对；技术证据（后端返回的计数/锚点）可原样展示，不硬编码界面标签。
- **样式**：scoped SCSS + CSS 变量（`--border-color`、`--text-muted`、`--accent-primary` 等）；新增颜色走 token，不写裸 hex。
- **测试锚点**：每个可交互/可断言节点带 `data-testid`，命名 `<域>-<对象>-<状态>`。
- **组件测试**：mock 对应 API 模块（`vi.mock('@/custom/governance/api/harness', ...)`），`flushPromises()` 后断言；失败态必须单独断言（不编造数据）。
- **懒加载**：大页签走异步组件/路由级 code split；首屏壳不静态引入重型工作台。

## 目录速查

| 路径 | 职责 |
|---|---|
| `ia2/` | 六阶段主界面与专题壳 |
| `ide/` | IDE 页签、会话、模型切换、自检面板 |
| `cockpit/` | 早期工作台聚合（trace/协作/审批组件仍被复用） |
| `governance/` | 治理组件与 API 客户端 |
| `ui/` | 基础控件与设计原语 |
| `test/setup.ts` | vitest 全局 setup |
