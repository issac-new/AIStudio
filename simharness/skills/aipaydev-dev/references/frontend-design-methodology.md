> **何时读我**：目标项目含前端设计任务时。impeccable 吸收——Modes/三层权威/反模式字典/对抗性 verdict。

# 前端设计质量方法论（impeccable 吸收）

> 来源：[pbakaus/impeccable](https://github.com/pbakaus/impeccable) v4.0.4（Apache-2.0），方法论引用层第 5 对象（与 superpowers/gstack/ECC/Ruflo 同档）。
> 纪律：只引用模式，不调 impeccable CLI / detector 引擎 / live 浏览器模式 / 子代理 TOML；不复制 `scripts/` 源码（上游仓库 [pbakaus/impeccable](https://github.com/pbakaus/impeccable) 可按需 `git clone` 到 `swarm-yuan/research/impeccable/` 供 AI 阅读引用，本地 gitignored，不入 git）。
> **impeccable v4.0 要点**：① **自动判别设计任务类型**——impeccable 现自行识别 5 类（blank-slate 空白/new-page 新页/addition 增段/redesign 重设计/refinement 局部精修），每类给不同自由度。这与 swarm-yuan 的改造分类（拼装式/侵入式/破坏式）+ 任务类型路由（feature/fix/refactor…）同向：redesign 把旧貌当证据替换（非打磨），addition 继承周围页面世界只决定引入部分。② 方向由骰子决定（dice-seeded）而非品味——外部种子命名方向 + 6 个挑战者世界，防同一 brief 总落在同三字体。这两项强化了 §二 Modes 四分类（按访客成功形态）之外的「按任务自由度」维度。
> 整合纪律：吸收优先于新增门禁，不新增 `check_*`，门禁数保持 55；复杂度预算不增。
> 适用场景：目标项目含前端 UI 维度（§D.0 判定）时，AI 在探查/填充/spec/审查节点引用本文方法论做前端设计质量决策。

---

## 一、定位：填补 swarm-yuan 的视觉设计空白

swarm-yuan 当前 17 项特征卡 / 55 门禁 / 80 框架规则集覆盖前端的「自动维度」（组件枚举/调用链/状态管理/props/循环依赖/CSS 污染/框架代码模式），但**零视觉设计规则**——不回答「这个 UI 是否在视觉上合格」。

impeccable 补的正是这条空白：

| 维度 | swarm-yuan 既有 | impeccable 增量 |
|------|---------------|----------------|
| 组件枚举 | §D.1-F `find *.vue/.tsx` + 签名提取 | 不重复，专注设计质量 |
| 调用链路 | §D.2-F 注册装配 + 挂载树 + store 依赖 | 不重复，专注视觉层级 |
| 组件架构门禁 | `--frontend`（循环依赖/嵌套深度/props 数） | 不替代，补视觉反模式 |
| 框架代码规则 | `references/frameworks/{vue,react,antd,...}.md` | 不重复，补设计层规律 |
| **视觉设计方法论** | **无** | **Modes + 三层权威 + craft-floor + 反模式字典** |
| **设计审查模式** | `references/review-methodology.md`（5 维代码审查） | **补双独立子代理设计审查 + 启发式评分** |
| **设计完工检查** | 无 | **finish_reviewer 三段式（persistence/ceiling/contract）** |

---

## 二、Modes 四分类：按访客成功形态分类 surface

**核心原则**：mode 命名的是「访客在这条 surface 上的成功长什么样」——从请求的 surface 推 mode，**不从 product 推**。mode 只在该 surface brief 内持久化，不全局继承。

| Mode | 访客目标 | 典型 surface | 设计要务 |
|------|---------|------------|---------|
| **Persuade** | 访客决定并行动；设计即产品 | landing page / 营销 / campaign / pricing | 赚取注意与行动；按承诺世界而非品类习惯发货真实图像 |
| **Operate** | 访客完成一个任务 | app UI / dashboard / editor / admin / settings / tool | 可扫性/一致性/原生预期/真实使用场景压过表达；品牌在精确细节 |
| **Read** | 访客理解某事 | docs / 文章 / guide / help / changelog | 为理解而结构，再让阅读体验值得停留 |
| **Experience** | 访客就在作品本身内 | portfolio / gallery / showcase | 让作品从第一视口领起，界面退后 |

**关键反模式**：工具的 landing page 仍是 Persuade（不是 Operate）；时装屋的文档仍是 Read（不是 Persuade）；docs 索引是 Read 不是 Persuade。

**Mode 驱动的差异**（AI 引用时遵循）：
- **访谈问题不同**：Persuade 问谁须行动+信什么+什么真证据；Operate 问任务/信息/重要状态/频率/约束；Read 问读者问题/源材料/结构/wayfinding；Experience 问什么领起/探索如何展开/什么交互或转场重要。
- **校准不同**：Persuade 开头必须让 offer 可懂可欲+暴露清晰行动+证明只有此产品能证的；Operate 表达不可遮任务/状态/熟悉 affordance；Read 理解与 wayfinding 完整；Experience 作品本身领起第一视口。
- **色彩/字号策略不同**：Operate 默认 Restrained 色彩策略、固定 rem 而非 fluid 字号；Persuade 可大胆；Read 重排版节奏；Experience 让作品领起。

---

## 三、三层权威分层：PRODUCT.md > DESIGN.md > surface brief

impeccable 用三层文档分层装「设计决策」，每层只装属于自己的真相，互不越界。

| 层 | 文件 | 装什么 | 不装什么 |
|----|------|--------|---------|
| 产品真相 | `PRODUCT.md` | 平台/用户/产品目的/定位/运营上下文/能力约束/品牌承诺/证据/产品原则/可访问性 | 视觉世界/调色板/排版/页面概念 |
| 视觉决策 | `DESIGN.md` | tokens（colors/typography/rounded/spacing/components）+ 8 段（Overview/Colors/Typography/Layout/Elevation/Shapes/Components/Do's and Don'ts） | 产品真相；只装视觉决策 |
| 单面策略 | `.impeccable/surfaces/<slug>.md` | scope + visitor mode + audience + job/action/proof/constraints + 选定方向 + memorable moment + 未决项 | PRODUCT.md 全局真相；DESIGN.md token |

**冲突仲裁铁律**：
- **brief wins**（本面策略优先）
- **DESIGN.md wins on visual decisions**（视觉决策归 DESIGN.md）
- **PRODUCT.md wins on durable product and voice**（产品真相和品牌口吻归 PRODUCT.md）

**与 swarm-yuan 的关系**：swarm-yuan 的 `spec-template.md` 是单一文档装需求+设计+测试+变更影响；impeccable 的三层分层**不替代 spec-template**，而是在「前端设计质量」子维度上提供更细粒度的权威分层。AI 在 spec §6（前端/UI 段）填充时可引用此分层组织设计决策。

---

## 四、craft-floor 矩阵：编辑前的质量地板

**核心原则**：floor holds the mechanics; it never picks the direction.（地板守机制，不选方向。）方向由 brief 决定，floor 只保证机制合格。

### Verify（动手前核验 8 项——对 built result 的检查，非意图）

每项是对构建结果的检查，不是意图声明。批量检查轮跑，不要每项单独截图（检查共享一次渲染）：

1. **Contrast（对比度）**：正文和占位符 ≥4.5:1，大字 ≥3:1。彩色表面上从该色相或前景色取色染二级文本；**永远不用灰色**。
2. **Depth（深度）**：阴影带偏移和柔焦。零偏移彩色光晕是装饰不是深度。
3. **Spacing（间距）**：紧分组、宽分离、标题上方空间多于下方。读计算值不读设计稿。
4. **Type（排版）**：正文 measure 65–75ch，display 最大 6rem，tracking 下限 -0.04em，平衡标题，明显的字号和字重阶梯。每个断点跑真实文案修溢出。
5. **Motion（动效）**：一个 authored moment，不是散落效果，不是每个 section 一个相同入场。从已可见默认值做指数 ease-out。超出 transform 和 opacity：blur/backdrop-filter/clip-path/mask/shadow 在保持流畅时属于调色板。
6. **States（状态）**：hover/disabled/loading/error/empty + 真实内容、可工作控件、响应式组合、键盘焦点。
7. **Copy（文案）**：产品自己的语言。控件命名其动作；错误命名问题和恢复路径。
8. **Coverage（覆盖）**：每条 brief 要求都在，几秒内可找到。

### Refuse（反 slop 清单——AI 生成 UI 的常见 tells）

**这是 swarm-yuan 完全缺失的「AI 生成 UI 反检测」维度**。这些是品类的默认值，不是禁令：brief 自己的话能 earn 任何一条。当轴自由时伸手拿一条 = 你没在决策；认识到这点意味着重写元素，不是软化它。

**Page scaffolds（页面脚手架反模式）**：
- 同尺寸卡片（icon + heading + text）作为页面结构。卡片是懒惰容器；**嵌套卡片永远错**。
- hero-metric 模板：大数字 + 小标签 + 支撑统计 + 强调色。
- 每个 section 上方一个 tracked uppercase eyebrow。一个 named kicker 是系统；到处 eyebrow 是你没选的语法。
- section 编号（01/02/03）除非序列本身承载读者需要的信息。
- 用 modal 做既不需要打断也不需要受保护专注的任务。

**Surface habits（表面习惯反模式）**：
- **Gradient text（渐变文字）**。强调来自字重或字号。
- Glass 和 blur 作为装饰而非特定效果。
- 卡片/列表项/标注/警告上 >1px 的 `border-left` 或 `border-right`。
- Sparklines / progress rings / 软阴影圆角矩形代替内容。
- Monospace 作为「技术」的戏服，而非用于代码/数据/测量。
- 按品类选浅色或深色。从使用场景选：谁、在哪、什么环境光。
- Tracking 停在 -0.04em。-0.02 到 -0.03em 通常读起来更好。
- elevation 声明一次，border 或 shadow。宽柔焦阴影下的 1px border 是 ghost card。卡片半径 12–16px；pill 给小控件。
- 真实插图或没有。素描风格 SVG 场景、`loose-sketch`/`doodle` 类名、`feTurbulence` 颗粒读起来业余。
- 背景是表面，只从主体世界取纹理。`repeating-linear-gradient` 条纹和双轴网格叠加需要其下有真实画布/地图/蓝图/测量工具。
- 声明和配置来自供应的真相；诚实标注示意值。命名一个概念然后反讽它不是声明。

---

## 五、23 命令能力矩阵（只列能力映射，不调 CLI）

impeccable 的 23 个命令分 6 类。AI 引用时按 swarm-yuan workflow 节点择相关命令的模式套用，**不调 impeccable CLI**。

| 类 | 命令 | 能力 | swarm-yuan 触点 |
|----|------|------|----------------|
| **Build** | `init` | 结构化访谈写 PRODUCT.md（产品真相，平台/用户/约束） | spec §1-§5 需求段填充 |
| **Build** | `shape [feature]` | 多轮发现访谈 + 方向选择 + 设计 brief，零代码 | spec §6 前端/UI 段 + 探查阶段 |
| **Build** | `document` | 从代码反推 DESIGN.md（YAML token frontmatter + 8 段） | reference-manual §7 设计资源清单 |
| **Build** | `extract [target]` | 提取可复用 token/组件进设计系统 | 特征卡第 11 项可复用稳定单元 |
| **Evaluate** | `critique [target]` | 双独立子代理（设计评审 + detector/浏览器证据）+ 启发式评分 + 快照 | review-methodology.md 5 维审查补设计维度 |
| **Evaluate** | `audit [target]` | 5 维 0-4 评分技术审计（a11y/perf/theming/responsive/integrity） | `--frontend` 门禁补视觉审计 |
| **Refine** | `polish` | 上线前最终质量 pass | release 阶段 |
| **Refine** | `bolder` | 放大 safe/bland 设计张力 | 设计迭代 |
| **Refine** | `quieter` | 降噪过激设计 | 设计迭代 |
| **Refine** | `distill` | 剥冗余提纯本质 | 设计迭代 |
| **Refine** | `harden` | 生产硬化（错误/i18n/边界/网络） | spec §19 测试设计 + §20 变更影响 |
| **Refine** | `onboard` | 首次体验/空状态/激活点 | spec §6 前端/UI 段 |
| **Enhance** | `animate` | 目的性动效与微交互 | 设计迭代 |
| **Enhance** | `colorize` | 战略性加色（不替世界） | 设计迭代 |
| **Enhance** | `typeset` | 字体/层级/可读性 | 设计迭代 |
| **Enhance** | `layout` | 排版/节奏/视觉层级 | 设计迭代 |
| **Enhance** | `delight` | 产品个性瞬间 | 设计迭代 |
| **Enhance** | `overdrive` | 技术野心（shader/spring/scroll-driven/虚拟滚动） | 设计迭代 |
| **Fix** | `clarify` | UX 文案改写 | spec §6 前端/UI 段 |
| **Fix** | `adapt` | 跨屏/设备/平台适配 | 响应式设计 |
| **Fix** | `optimize` | UI 性能瓶颈定位 + 度量 | `--frontend` bundle 检查 |
| **Iterate** | `live` | 浏览器内热替换变体（HMR + 选元素 + SSE poll） | **不引用**（需 impeccable CLI，方法论引用层禁） |

---

## 六、59 反模式 ID 清单（AI 引用执行的设计反模式字典）

impeccable detector 引擎含 59 条反模式规则，分 slop/layout/type 三 category。**swarm-yuan 不复制 detector 引擎实现**，只把规则 ID + 描述作为 AI 引用字典——AI 在审查前端代码时按此清单识别反模式并给出修复建议，**不机器执法**（不新增 `check_*` 门禁）。

**代表性反模式**（完整清单见上游仓库 `impeccable/.agents/skills/impeccable/scripts/detector/registry/antipatterns.mjs`，可 `git clone` 到 `research/impeccable/` 本地参考）：

- **slop 类**（AI slop tells）：`side-tab` / `gradient-text` / `ai-color-palette` / `cream-palette` / `nested-cards` / `bounce-easing` / `pulsing-dot` / `overused-font` / `gray-on-color` / `tiny-text` / `glow-shadows` 等
- **layout 类**：`text-overflow` / `clipped-overflow-container` / `body-text-viewport-edge` / `broken-image` 等
- **type 类**：`low-contrast` / 字号阶梯缺失 / tracking 越界等

**执行方式**：AI 在 `--frontend` 门禁跑完后（自动循环依赖/嵌套深度/props 数），按此清单做人工视觉审查，发现反模式在审查报告中列 ID + file:line + 修复建议。**不 fail 阻塞主流程**（advisory 风格，对齐 G8/G10）。

---

## 七、原生平台适配

impeccable 对原生平台（iOS/Android）有专门的 reference 和命令变体路由。

**平台识别**：从 PRODUCT.md `## Platform` 段读 `web`/`ios`/`android`/`adaptive`（双 OS 列表归 adaptive）。

**平台设计约束**：
- **iOS**（`reference/ios.md`）：HIG 一致性 / safe area / 系统导航（tab bar/navigation stack/sheet）/ edge-swipe back 不可禁 / large title / **44×44pt 触控** / Dynamic Type / SF Pro/SF Compact / semantic system colors / Dark Mode / system materials / SF Symbols / Reduce Motion
- **Android**（`reference/android.md`）：Material 3 / Material navigation（bar/rail/drawer 按宽度）/ predictive Back / edge-to-edge + window insets / Top app bar + FAB / **48×48dp 触控** / Material type scale / Roboto / sp 单位 / Material color roles / Dynamic Color (Material You) / tonal elevation / Material motion patterns / Remove animations

**命令变体路由**：
- `adapt.native.md` / `audit.native.md` 是原生变体，路由到 `ios.md`/`android.md`
- 原生平台不 lead with `live` 或 detector（detector 读 HTML/CSS，原生无适用）
- hook 在原生平台短路（`automaticHookMode` → `none`）

**与 swarm-yuan 的关系**：swarm-yuan 有 `references/frameworks/{ios-swiftui,android,react-native,flutter}.md` 框架代码规则，但那是代码模式；impeccable 的 ios.md/android.md 是**设计约束**。两者互补不冲突。

---

## 八、决策页 + 掷骰子机制（决策对齐工具）

**解决的问题**：模型自己挑概念总是 argmax rut（30/35 跨 16 prompt 框架相同概念），必须从外部掷骰子才能逃逸。

**机制**（AI 引用模式，不调 impeccable CLI）：
- `concept-seed.mjs` 外部掷骰：分配索引（从模型自己的 resonance 排序短列表里挑哪条去建）+ 6 个 challengers（来自 concept-ingredients.json，分 graphic system/instrument language/atmosphere world 三层）+ re-roll 链
- `serve-question.mjs` 守护进程 + 决策页 + key + `--wait` 收集 ANSWER

**swarm-yuan 引用方式**：在 spec §6 前端/UI 段或 new-work 决策时，AI 主动提出 2+ 方案权衡 + 推荐（对齐决策治理 UserChallenge 类五要素），**不自动决定**。impeccable 的掷骰子机制是「把用户决策拉回设计选择现场」的参考模式——AI 可采用其「外部 challengers」思路扩大方案空间，但执行用 swarm-yuan 自带的 `references/decision-governance.md` 五要素 + `decisions.jsonl` 留痕。

---

## 九、finish_reviewer 完工审查模式

impeccable shipped 的 `finish_reviewer` 子代理做完工审查，三段式：

1. **persistence 检查**：PRODUCT.md + DESIGN.md 都在且匹配（新世界无 DESIGN.md = 未完成 run）
2. **ceiling 检查**：对照 QUALITY BAR 卡（craft-floor Verify 8 项 + Refuse 反模式清单）
3. **contract promise-by-promise**：5 段方向契约逐条核（每条 promise 都要在交付物中找到对应实现）

**与 swarm-yuan 的关系**：swarm-yuan 的 `references/governance-agents.md` 是四权分离治理 agent（policy/action/self-review/verifier），**无 craft/审查类子代理**。finish_reviewer 的三段式可作为 swarm-yuan 在前端设计完工检查时的参考模式——AI 在 `--verify-completeness` 后对前端交付物按 persistence/ceiling/contract 三段做人工审查，发现未完成项回 Step 7 继续填充。

---

## 十、与 swarm-yuan 既有触点的整合声明

本文档**只指向**，不重复定义既有触点：

| 既有触点 | 文件:行 | 整合方式 |
|---------|--------|---------|
| 项目形态判定 | `exploration-guide.md` §D.0（L228-243） | 加「视觉成熟度」探查子维度（见 §十一） |
| 前端组件枚举 | `exploration-guide.md` §D.1-F（L290-304） | 不重复，impeccable 专注设计质量不枚举组件 |
| 前端调用链路 | `exploration-guide.md` §D.2-F（L459-497） | 不重复，impeccable 专注视觉层级不画调用图 |
| 前端编排约束 | `exploration-guide.md` §D.3（L580-602） | craft-floor 可作为新增「设计约束」类别参考 |
| 特征卡第 11 项 | `exploration-guide.md` L809-854 | 11b/11d 已枚举组件/store，impeccable 不加新子项 |
| 特征卡第 15 项 | `exploration-guide.md` L971-1008 | 15a-f 已含 6 类约束，不加第 7 类 |
| reference-manual §7 | `template-spec.md` L289 | **最直接触点**：「UI/UX 设计资源清单」扩展引用本文档三层权威分层 |
| spec-template §6 | `template-spec.md` 前端/UI 段 | 扩展引用本文档 Modes + 设计 brief |
| `--frontend` 门禁 | `gates-warn.sh` check_frontend | 不替代，补视觉反模式 advisory |
| 框架规则集 | `references/frameworks/{vue,react,antd,...}.md` | 不重复，补设计层规律（如 Tailwind 类顺序/色彩对比） |

---

## 十一、视觉成熟度探查子维度（§D.0 扩展）

在 `exploration-guide.md` §D.0 项目形态判定加一个探查子维度，**不改 17 特征卡数字**（§D.0 是探查方法论，非特征卡项）。

**探查信号**：
- CSS custom properties（`--*:`）数量 ≥3
- className tokens（独特类名）数量 ≥12
- styled-components / CSS Modules / Tailwind config 文件 ≥3
- DESIGN.md 存在性

**判定产出**：
- 「有现存视觉实现但无 DESIGN.md」→ 引用本文档 `document` 命令模式（从代码反推 DESIGN.md）
- 「有 DESIGN.md」→ 引用本文档 `extract` 命令模式（提取 token 进设计系统）+ craft-floor 审查
- 「空白」→ 引用本文档 `init` + `shape` + `new-work` 命令模式（从 PRODUCT.md 起建视觉世界）

**降级**：探查信号不全时，按更重档处理（质量优先），全量引用本文档方法论。

---

## 十二、不引用的部分（守纪律声明）

以下 impeccable 能力**不引用**，守方法论引用层「只引用模式不调 CLI」铁律：

- `scripts/detector/` 引擎实现（59 反模式的检测代码，5282 行 checks.mjs）——只引用规则 ID 字典，不调引擎
- `scripts/live/` 浏览器内热替换变体（HMR + SSE + 选元素，~7k 行）——需 impeccable CLI + 浏览器扩展，方法论引用层禁
- `agents/*.toml` 子代理 TOML（finish_reviewer/asset_producer/manual_edit_applier）——只引用模式，不注册子代理
- `scripts/concept-seed.mjs` / `serve-question.mjs` 掷骰子工具——只引用「外部 challengers」思路，不调守护进程
- `scripts/hook.mjs` / `hook-lib.mjs` 设计 detector hook——swarm-yuan 已有 `failure-detector.sh` + `integrity-guard.sh` 两道 hook，不重复引入设计 detector hook

---

## 十三、版本与来源

- 来源：[pbakaus/impeccable](https://github.com/pbakaus/impeccable) v4.0.4
- 许可证：Apache License 2.0
- 上游仓库：[pbakaus/impeccable](https://github.com/pbakaus/impeccable) v4.0.4（可按需 `git clone` 到 `swarm-yuan/research/impeccable/` 供 AI 阅读源码，本地 gitignored，不入 git）
- 整合纪律：吸收优先于新增门禁 + 复杂度负向预算，门禁数保持 55
- 自检断言：G13 `check_frontend_design_methodology`（`self-check.sh`，warn-only，守本文档存在性 + SKILL.md 整合 + facts.conf 口径）
- 口径同步：`facts.conf` `FACT_RUNTIMES=12` / `FACT_RUNTIMES_METHOD=5` / `FACT_REFERENCES=30`
