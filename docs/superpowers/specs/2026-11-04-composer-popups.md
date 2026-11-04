# 2026-11-04 composer 工具条弹层三缺陷（遮罩中断/位置不对/多开叠层）＋存量红处置收官

## 变更

用户走查（`#/app/ide?session=…` 会话视图 composer 工具条）报「所有按钮的弹窗都存在遮罩中断、位置不对」。活体定谳三处同型缺陷，修复：

1. **弹层被输入区盖住（「遮罩中断/位置不对」主根因）**：思考菜单（`.ide-chat__effort-menu` z-30）、⚙ 设置菜单（锚 `.ide-chat__csettings` z-20 造栈上下文，菜单 z-30 被困）、⛨ 权限面板（`.ide-perm__panel` z-40）都向上弹进 ChatInput 输入区地盘，而输入区 z-80（ChatInput.vue:1713）——弹层上半被输入框整片盖住（elementFromPoint 实锤命中 input-textarea），视觉残缺＝「位置不对」，点击落进输入框＝「遮罩中断」。修复＝三锚根开弹时 `is-open` 抬 z-index 110（同状态栏面板修复口径：压过 z-80 输入区与 z-100 分割条命中域）。
2. **无互斥**：思考/⚙/⛨ 三弹层可同时开（活体实锤两菜单同时可见叠层）。修复＝文档级 pointerdown 点外关闭：点击落在该组件锚根之外（含另一弹层的触发钮）即收起；互斥由「点 A 触发钮＝B 的点外」自然获得（pointerdown 先关 B、click 再开 A，顺序天然正确）。
3. **无点外关闭**：同上 handler 覆盖（点击输入框/页面任意处收起）。模型选择器（IdeEngineModelsDialog z-500 模态）层级本就正确不动。

**存量红处置（同批收官，无码改）**：diagram-export×3＝本机 playwright chromium 缓存缺失（chromium_headless_shell-1243 不在位，系统 Chrome 通道又因版本协议不匹配启动即关）——`npx playwright install chromium` 装回后 5/5 绿；specialist-presets×1＝上游 routa 仓读取的瞬时态（当时两树同红，现单跑 5/5 绿，全量终跑再确认）；满载 20s 超时×7＝并发负载抖动（两树单跑均绿），全量终跑（不带额外 dev 服务负载）复核。

## 决策记录

- **决策 D1（抬层口径 110）**：与 2026-11-04 状态栏面板修复（ide-workspace-bugs spec）同值——高于输入区 z-80 与三栏分割条 z-100（±5px 加宽命中域），低于页头面板层 800/z-layers 体系，不侵入全局层级立法。
- **决策 D2（点外关闭用文档级 pointerdown 而非 click）**：pointerdown 先于 click 触发，保证「点另一弹层触发钮」时旧弹层先收起、新弹层由 click 正常开启，无竞态；先例＝IdeDevTools.onDocPointerDown。
- **决策 D3（is-open 条件抬层而非静态高 z）**：锚根常驻高 z 会让触发钮所在行片带常驻覆盖语义（悬停/命中测试面变大），开弹才抬层把影响面收到弹层存续期。

## 验证

- 新增守门 `custom/client/ide/__tests__/composer-popups-stack-guard.test.ts`：三锚 is-open z≥110＋两组 pointerdown 接线（源码级断言，jsdom 无真实层叠先例同前批）。
- 目标测试：`npx vitest run custom/client/ide/__tests__/ custom/client/ia2/__tests__/ia-shell-header-mask-order-guard.test.ts`。
- 活体走查（修复后）：思考菜单完整可见且顶点命中自身（不再命中 input-textarea）；思考开→点 ⚙ 只剩 ⚙ 开；点输入框/空白处全收；⛨ 面板同验。
- 合并前全量 `npm test`（不带 dev 服务负载）。

## 设计文档影响

DESIGN_SYNC: none
理由：composer 弹层交互缺陷修复，层级口径沿用 2026-11-04-ide-workspace-bugs 批已立的 110 值，不改整合正本/数字总账。
