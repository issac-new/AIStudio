# 工作台栏控统一窗口语义（最小化/最大化）＋「页面导览」退役

- 日期：2026-10-23
- 版本：v1（分支 feat/column-controls-unify）
- 需求：用户原话「相关位置的内容 统一改为最大化最小化按钮实现对应栏位最小化折叠及全屏，"页面导览"毫无意义，删掉吧」（2026-10-23 工作台会话页实测语境）
- 交付面：overlay custom client（IaColumnControls 组件统一 + flow store 三栏折叠位 + WorkbenchView/IdeShell 接线 + TabIntroBanner 组件族删除）+ patch 473 词条。

## 改动

1. **栏控统一**：`IaColumnControls` 三栏一致的窗口语义按钮——最小化（– 折叠本栏）/最大化（⤢ 本栏独占）/还原（⤡）/独立窗口（⧉ 仅可弹路由栏）。props `fold` 方向箭头模式退役，改 `showMin`（默认 true）；emit `fold`→`min`。IDE 侧（IdeShell 侧栏/会话列）同组件自动跟随。
2. **flow store**：布局态扩为三折叠位布尔 `{leftFolded, centerFolded, rightFolded}`（`centerFolded` 新增），独占栏 `maximized` 纯派生（恰一栏展开时该栏名，否则 'none'）——无新增独立状态。`toggleMax(side)`：已独占→三栏齐展（还原）；否则→只展该栏。`toggleCenterMax`/`centerMaximized` 兼容保留（语义等价 toggleMax('center')）。
3. **WorkbenchView**：三栏全挂「最小化+最大化」，中栏保留独立窗口；中栏新增折叠导轨（wb-rail-center + wb-unfold-center，❭ 展开钮）；栅格轨道/wb--cf 类支持中栏 18px。
4. **「页面导览」全量退役**：TabIntroBanner 组件、i18n-tab-intros.ts 词条源、14 处视图挂载（工作台/任务/收件箱/推演六签/治理各页/Agents）、tab-intros-gate.test.ts 守门测试删除；cockpit-nav-usability 中其专属 describe 块删除。
5. **patch 473 词条**：wm 段新增 minPane/maxPane/restorePane/unfoldCenter（en+zh）；退役 foldLeft/foldRight/maxCenter/restoreCenter；unfoldLeft/unfoldRight 保留（导轨展开钮在用）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | 每栏统一「最小化+最大化」窗口语义（– / ⤢ / ⤡） | 用户裁定；三栏交互一致降低学习成本；IDE 侧已是折叠+最大化双钮形态，共用组件天然对齐 | 左右栏只保留折叠（否决：正是用户要统一的现状） | 是 |
| 2 | 独占栏=三折叠位纯派生，不加独立状态 | 单一事实源：折叠位既表达最小化也表达独占，无状态同步问题 | 独立 maximized 枚举状态（否决：与折叠位可互斥出非法组合） | 是 |
| 3 | 中栏也可最小化（18px 导轨 ❭ 展开钮） | 「对应栏位最小化折叠」全覆盖；中栏折叠后左右两栏自然扩展 | 中栏不可折（否决：统一语义有缺口） | 是 |
| 4 | 最大化还原=三栏齐展（不记忆中间态） | 沿用原 toggleCenterMax 语义先例，直白 | 记忆独占前布局（否决：复杂度换低频收益） | 是 |
| 5 | 「页面导览」整族删除而非保留入口 | 用户裁定「毫无意义」；首访展开+localStorage 记忆机制维护成本>价值 | 默认收起保留（否决：用户明示删） | 是 |
| 6 | 图标 –/⤢/⤡ 与窗口控件通识一致 | 用户表述即「最大化最小化按钮」；方向箭头（◀/▶）语义是折叠非最小化 | 保留方向箭头（否决：语义不一） | 是 |

## 验证证据

- 六套定向：ia-column-controls（新语义 4 用例）+ workbench-flow（统一后栏控接线 1 大用例含右栏独占/中栏导轨新增断言）+ cockpit-nav-usability（TabIntroBanner 块移除后 10 用例）+ harness-improve-panel（stubs 清理）+ unified-nav-guard + ide shell-layout（testid 同步）= **68/68 绿**。
- 整目录回归 `custom/client/ia2/__tests__/ + custom/client/ide/__tests__/` = **1491/1491 绿**。
- 词条经 patch 473 注入（inject 后生效）；浏览器 8649 视觉走查（截图验收：三栏按钮形态/最小化导轨/独占态/页面导览消失）。

## 残留与移交

- 独占态下再点另一栏导轨展开即脱离独占（导轨展开=恢复多栏，语义直白，无专门「退出独占」按钮——还原图标 ⤡ 在独占栏自身）。
- IDE 面独占语义沿 ide store 既有实现（本轮仅对齐按钮形态），未统一到 flow 派生模型——两 store 场景不同（ide 有 sidepane 四区），不为形式一致强行合并。
