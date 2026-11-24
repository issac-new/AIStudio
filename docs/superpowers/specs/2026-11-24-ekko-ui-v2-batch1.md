# Ekko UI v2 批一：协议 v2 与表达力（C 方案第一切片）

- 状态：in-progress（2026-11-24）
- 性质：能力扩展批（A 类纯 custom/，零新增补丁）
- 上游依据：`vendor/hermes-studio/packages/ekko-agent/docs/interactive-ui-plan.md`（表达式扩展以版本化 AST 节点加入、能力协商、目录按需查询）
- 源头依据：ChatGPT 智能界面（DIL）一手逆向调研（2026-11-24，本会话）：派生值/条件/循环是「可计算卡片」的核心；动作按能力收口（turn/copy/openUrl）；制品可版本化

## 变更

一句话：把 `ekko-ui/v1` 扩到 `ekko-ui/v2`——界面从「静态表单」升级为「可计算卡片」：表达式有算术、比较、格式化、条件、循环模板，部件目录新增图表/图片/指标卡/标签页/步骤条等，动作新增发起新轮、复制、打开链接；v1 spec 行为不变。

具体落地（全部在 custom/ 与 docs/，零新增补丁）：

1. **协议 v2**（`custom/client/chat/ekko-ui/protocol.ts`）：
   - 新增版本化 AST 节点：`arith`（+ − × ÷ %）、`compare`（> >= < <=）、`format`（number/currency/percent/date）、`length`、`concat`、`if`（ternary）、`coalesce`、`map`（列表模板，绑定 item/index 局部变量）。
   - 求值预算：单表达式最多 256 步、深度 32，超限返回 undefined（fail-soft，不抛进渲染）。
   - 新部件 8 个：`chart`（bar/line/pie，原生 SVG，不引依赖）、`image`（https/data:image 白名单）、`metric`（指标卡）、`tabs` + `tab-panel`（本地切换）、`steps`、`empty`、`descriptions`。目录 30 → 38。
   - 新动作 3 个：`surface.turn`（文本由状态模板拼成，发起新一轮对话）、`surface.copy`、`surface.open_url`（https/mailto 白名单，动态值在动作出口处复验）。
   - 属性绑定包装：`{$state: path}` 与 `{$template: 文本}` 对字符串类属性放行（对齐渲染器既有行为——此前渲染器支持但校验器拒绝，属校验器滞后）；`{$expr: 表达式}` 为 v2 独有，校验期递归校验内层表达式。
   - 能力协商结构 `EkkoUICapabilities` + `clientCapabilities()`：protocolVersions 含 v1/v2，features 按批启用（本批 blocking=true，persistent/updates/logicRuntime/appBlock=false）。
   - v1 与 v2 双协议并存：v1 spec 按 v1 目录与表达式校验，行为逐字节不变；v2 独有节点/部件/动作在 v1 spec 中一律拒绝。
2. **渲染器**（`EkkoUINode.vue`、`EkkoUISurface.vue`）：新部件映射原生 HTML + Pure Ink token（chart 为内联 SVG）；新动作 outcome 经 `turn`/`copy`/`open-url` 事件上抛；`map` 局部作用域经 provide 链路传递。
3. **聊天卡片**（`EkkoUISurfaceCard.vue`）：处理三个新动作——`surface.turn` 走 `chatStore.sendMessage` 既有通道（与键盘输入同路径）；`surface.copy` 写剪贴板；`surface.open_url` 经 scheme 复验后 `window.open`。
4. **服务端契约**（`custom/server/ekko-ui/contract.ts`）：`spec.protocol` 接受 v1/v2 两个值，传输级限制不变。
5. **测试**：协议 v2 用例（新 AST/部件/动作/能力位/v1 拒绝 v2 节点）、渲染器新部件用例、卡片新动作用例、契约双协议用例。

明确不在本批（防范围蔓延）：

- MCP 目录工具 `ekko_studio_surface_catalog` → 移至批二（见 D4）。
- 持久化、非阻塞生命周期、更新补丁、续接轮 → 批二。
- 沙箱逻辑运行时 → 批三；app_block 逃生舱 → 批四。
- 逐字流式渲染（不做，见 D1）。

## 决策记录

- **D1：书写格式沿用 JSON 工具协议，不自研类 DIL 文本语言**。OpenAI 的 DIL 依赖对 GPT-6 的专门训练才稳定；本仓通用模型经 v1 真实会话验证可稳定产出 JSON。代价：做不到逐字流式渲染，界面按「创建→更新」逐步出现。用户在方案审批中选定 C（含此默认）。
- **D2：首个验收场景＝研发日常卡片**（门禁/看板结果卡、可调参数估算器、条件逻辑表单），部件目录优先级据此排序（chart/metric/tabs 先于装饰性部件）。用户在方案审批中未作答，按推荐默认执行。
- **D3：新动作在客户端落地，零服务端变更**。`surface.turn` 复用 `chatStore.sendMessage`（vendor chat.ts:3876）——与键盘输入同一条用户消息通道，天然带会话归属与排队语义；`surface.copy` 用 navigator.clipboard；`surface.open_url` 在动作出口复验 scheme（校验期无法知道动态值）。批二引入持久 Surface 后，`surface.turn` 语义不变。
- **D4：MCP 目录工具移至批二**。`bin/ekko-studio-mcp.mjs` 是 vendor 文件，改动需新增补丁；当前 `chore/vendor-upgrade-agent-v0234` 在途且触及补丁面，仓规要求加补丁任务串行。批二本就要为消息管线加补丁，目录工具并入可收敛 series 撞号风险。批一内 Agent 的目录发现靠校验器的可修复错误（未知部件/属性时返回允许值清单，上游规划已要求）。
- **D5：v1/v2 双协议并存，v1 行为逐字节不变**。`validateSpec` 按 `spec.protocol` 分流；v2 独有 AST 节点、部件、动作在 v1 spec 中校验失败（不是静默忽略）。存量 v1 卡片与测试不需任何修改。
- **D6：chart 用原生 SVG 实现，不引图表库**。hermes-studio 客户端无既有图表依赖，引入 ECharts/G2 会让 vendor 补丁面与包体同步膨胀；bar/line/pie 三形态用内联 SVG 足够覆盖研发卡片场景，且天然跟随宿主 token。
- **D7：表达式求值带预算（256 步 / 深度 32）**。`map` 嵌套与长 concat 链可构造指数级求值，预算超限返回 undefined 并计入校验期深度检查；渲染不因此崩溃（fail-soft）。
- **D8：能力协商结构本批落地但全部按批启用**。`clientCapabilities()` 返回真实能力集（blocking=true，其余 false），为批二/三/四的 features 翻转预留单一读取点；本批不改变任何现有行为。
- **D9（TDD 中发现的 DoS 面，随批根治）：体积估算与表达式校验全部预算化**。TDD 的 DAG 用例（同一对象既作 then 又作 else，40 层）把校验挂死数小时——根因有二：① `byteLength` 用 `JSON.stringify` 量体积，共享子树按引用路径展开成 2^40 节点；② 表达式校验的深度限制挡不住 DAG（访问路径数是指数量级）。修复：客户端与服务端的 `byteLength` 改为带 10 万访问上限的递归估算（共享子树按出现次数重复计，与序列化语义一致）；表达式校验与求值共用 256 步访问预算，耗尽即抛 `ExpressionBudgetExceeded` 立即展开递归（逐点返回挡不住指数遍历）。回归守门用例断言 2 秒内拒绝。

## 验证

- 单测（2026-11-25 全绿，67 例）：
  - `custom/client/chat/ekko-ui/__tests__/protocol-v2.test.ts`（18 例）：v2 合法 spec、新 AST 全家族（arith/compare/format/length/concat/if/coalesce/map/object/array/var）、新部件校验、新动作校验与出口、v1 拒绝 v2 节点、**DAG 共享子树快速拒绝（DoS 回归守门）**、image scheme 白名单、$state/$template/$expr 绑定、tabs 父子约束、能力协商。
  - `custom/client/chat/ekko-ui/__tests__/protocol.test.ts`（16 例，v1 原样）：v1 行为不变。
  - `custom/client/chat/ekko-ui/__tests__/renderer-v2.test.ts`（7 例）：chart 三形态 SVG、metric $expr、tabs 本地切换不跨边界、steps/empty/descriptions、image 动态非法 scheme 不渲染、map 循环行、turn/copy/open_url 事件上抛。
  - `custom/client/chat/__tests__/ekko-ui-card-v2.test.ts`（3 例）：surface.turn 走 chatStore.sendMessage、copy 写剪贴板、open_url 复验 scheme 后 window.open。
  - `custom/server/ekko-ui/__tests__/surface-runs.test.ts`（10 例，含新增双协议用例）：v2 受理、未知协议拒绝。
- 类型：`npm run typecheck:harness` 零错误；`npm run typecheck:client:ratchet` 15 ≤ 基线 19（零新增）。
- 守门：`raw-hex-budget` / `wcag-contrast` 8 例全绿（新部件全部走 token 派生，零裸 hex）。
- 全量 `npm test`：9971 过 / 2 失败（均为新 spec 未入文档索引）→ `gen-doc-indexes --write` 补账后两文件 29 例转绿 → 全量复跑确认（结果见交付说明）。
- 实物走查（2026-11-25，走查页非真实会话）：`walkthrough-v2/`（临时目录，不入库）挂「发布成本估算器」v2 spec（range + metric $expr + chart $expr map + tabs + steps + descriptions + 三动作按钮），vite 打包 + 无头 Chrome 取证：亮色/暗色两帧渲染正常；DOM 转储核验 metric 显示 ¥232.00（arith+format 即时求值）、chart SVG 在位、tabs 双面板、steps 三态；`?demo=turn` 自动点击「按此方案继续」后事件日志出现 `turn: {"text":"按 8 席方案继续，月费 ¥232.00"}`——动作管线端到端成立。
- 未做（诚实声明）：真实 Hermes 会话的 v2 端到端（Agent 经 MCP 工具发 v2 spec）未走查——v2 的 Agent 侧发现依赖校验器可修复错误（D4），目录工具与提示引导在批二补齐后统一走查；v1 会话路径已由 2026-11-16 批验证且本批零改动。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §2.3「协作、审批与检索」：Ekko UI Surface 段更新为 v2 能力（可计算卡片、新部件与动作、双协议并存、能力按批启用）。
- `docs/manuals/aistudio-feature-inventory.md`「对话内声明式界面」行：能力描述更新到 v2（目录 38 项、新动作、v1 兼容边界）。
- 协议/事件/目录仍是单一事实源，落在本 spec 与 `custom/client/chat/ekko-ui/protocol.ts`；后续改动先改 spec 再改实现。
- 不改变现有聊天消息 schema、审批、澄清、任务计划的行为与契约；不新增数据库表；不新增补丁。
