# 2026-11-04 会话消息区被工具条压缩（发送后消息几乎不可见）——评审面板改可折叠

## 变更

用户报「输入发送后在对话框不可见」。活体定谳：非消息流缺陷——中栏 chatBody（515px）底部常驻五条工具行（mention 24＋secbar 32＋import 22＋know 22＋**评审面板 122**＝222px）＋输入区 232px，把 messages-anchor（flex 1 1 0%）挤到 **44px**；虚拟列表滚到底时最新消息只剩 ~23px 细缝，视觉即「不可见」。评审面板（IdeReviewPanel）是最大挤占者：空态（无 findings）也全宽渲染头行＋空态块＋verdict 按钮三段。

修复：IdeReviewPanel 改可折叠——头行常驻（实测 19px，含 open/resolved 计数与 ▾/▸ 指示，点击切换）；findings 列表/空态块/verdict 按钮仅在展开态渲染，展开由事件驱动（见 D2）。空态高度 122→19px，消息区实测 44→181px（约 4 倍）。

## 决策记录

- **决策 D1（只折叠评审面板，不动其余四条工具行）**：评审空态块是最大单一挤占者（122px，占五条总高的 55%），折叠即恢复消息区 3 倍高度；mention/secbar/import/know 四条是单行触发钮（设计形态），横排收纳属布局重构，挂账后续（见验证段）。
- **决策 D2（展开事件驱动）**：折叠语义是「无内容时让位」，不是「藏内容」。首版推导式 `expanded = userUnfolded || openCount > 0` 被行为测试证伪——最后一例 open finding 被 resolve 的瞬间面板塌掉，verdict 三选一还没点。终版事件驱动：watch(open) 有 findings 到场→自动展开；open 清零→保持展开（verdict 在场）；用户手动折叠生效；新 findings 再来再自动弹开。
- **决策 D3（verdict 按钮随展开走）**：通过/打回/有条件三钮在无 findings 时无操作对象，收进折叠与空态同层；有 findings 展开时在场。

## 验证

- 新增守门 `custom/client/ide/__tests__/review-panel-collapse-guard.test.ts`：源码级断言（expanded 推导含 open findings 强制展开；空态块与 verdict 行在 v-if=expanded 内；头行常驻可点折叠）。
- 目标测试：`npx vitest run custom/client/ide/__tests__/`。
- 活体走查（8651 复制登录态进会话，实测）：评审条折叠 19px/展开 122px 切换正常（发起评审按钮随展开出现、随折叠消失）；消息区 44→181px；`replica-r6-r9` 行为测试覆盖「resolve 最后一例后 verdict 仍在场」与「空态折叠需先点头部才见发起评审」。
- 合并前全量 `npm test`。

挂账（不在本批）：四条单行工具条横排收纳（220px→~30px）可再释放 ~110px，属中栏布局重构，待用户对 142px 高度的反馈再立项。

## 设计文档影响

DESIGN_SYNC: none
理由：中栏底部工具条族的显示形态调整（常驻展开→空态折叠），不改契约/阈值/口径结构；工具行收纳挂账已在本 spec 留痕。
