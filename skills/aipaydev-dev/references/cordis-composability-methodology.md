> **何时读我**：设计可组合/时空可扩展的机制时。DeepSeek Cordis 吸收——时空可组合性方法论。

# 时空可组合性方法论（Spatiotemporal Composability）

> 来源：[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness) + [Cordis](https://github.com/cordiverse/cordis)，论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)（2026-08-13 草稿，cordiverse 组织）。
> 纪律：只引用方法论模式与设计视角，不调任何上游 CLI / 运行时引擎；不复制源码（上游仓库可按需 `git clone` 到 `swarm-yuan/research/cordis/` 供 AI 阅读，本地 gitignored，不入 git）。
> 守决策 27：吸收优先于新增门禁，不新增 `check_*`，门禁数保持 55；守决策 26：复杂度预算不增。
> 适用场景：目标技能 的**扩展机制设计**（框架门禁注入/移除、conf 变量依赖管理、profile 升降档、hooks 注册/清理）时，AI 引用本文方法论决定**组件变更的副作用是否可控、依赖是否可追踪**。也用于 swarm-yuan 仓库自身的 `--inject-frameworks` / `--upgrade` / conf 渲染等扩展点设计（本仓库的框架门禁标记区块是一套"轻量时空可组合性"的元范例）。

---

## 一、核心理念：时空可组合性

Cordis 论文提出，动态组合系统（插件架构、自我进化的 AI agent）需要两个正交维度的可组合性：

| 维度 | 定义 | 一句话 |
|------|------|--------|
| **时间可组合性** | 组件移除时能**完全撤销其副作用** | 加得进来，就拆得干净 |
| **空间可组合性** | 声明并**响应式管理组件间依赖** | 改一处，依赖它的都知道 |

传统范式通常只做到其中一个：
- 响应式编程擅长空间维度（数据流依赖追踪），但忽略组件生命周期的清理
- 事务/补偿擅长时间维度（回滚），但不管运行时依赖传播

Cordis 把两者统一在同一套机制里。

## 二、两大核心机制

### 可逆效应（Reversible Effects）

每次上下文转换（注册一个工具、声明一个门禁、写入一个配置）都携带一个**逆操作**，运行时跟踪：

- 注册函数 `register_tool("foo", impl)` → 逆操作 `unregister_tool("foo")`
- 写入 conf `SECURITY_TOOL="semgrep"` → 逆操作 `SECURITY_TOOL=<旧值>`

**关键特性**：插件卸载时，运行时**自动按逆序执行**所有逆操作——不需要插件自己写 cleanup 代码。这保证了"加得进来就拆得干净"。

### 响应式协效应（Reactive Coeffects）

组件声明它**需要从上下文获取什么**（协效应规范），上下文变更时**自动通知**依赖它的组件：

- 门禁 `--sensitive` 声明协效应：`needs(SCAN_DIRS, SENSITIVE_TOOL)`
- 当 `SCAN_DIRS` 被修改时，`--sensitive` 自动重新评估

**关键特性**：依赖关系是**声明的**而非隐式的——系统知道"改了 X 会影响 Y"，不需要人记。

## 三、dsh 的架构落地

DeepSeek Harness 把 Cordis 理论落地为 "Everything is a Plugin" 架构：

1. **没有特权核心**——agent 的每个能力（模型适配器、工具注册表、会话日志、agent loop）都是可替换插件
2. **注册是效应**——"registrations are effects that unwind when their plugin unloads"（注册即效应，卸载即回退）
3. **分层组合**——Profile 声明堆叠哪些 Bundle，Bundle 按 patch 行应用；每层可替换上一层的行或插入新行
4. **声明式配置**（`.cordis.yml`）——`insert` 语义暗示有对应的 `remove`（可逆）

48 个插件化 packages 覆盖 agent 的全部能力：core/skill/guard/hooks/context/plan/goal/session/sandbox/mcp/llm 等。

## 四、对 swarm-yuan 的设计启发

### 4.1 框架门禁标记区块——"轻量可逆效应"

swarm-yuan 的 `--inject-frameworks` 已经实现了一种"轻量可逆效应"：
- 标记区块 `# >>> swarm-yuan:framework-gates >>>` ... `# <<< ... <<<` 界定了注入范围
- 重跑 inject 时，awk **先丢弃旧区块内容，再写入新内容**——效果上"可逆"
- sha 校验检测区块是否被手改（`framework_gates_sha`）

**与 Cordis 的差距**：swarm-yuan 的"可逆"需要**用户主动触发重跑**，而 Cordis 是**卸载时自动 unwind**。在静态 bash 世界里无法做到运行时自动卸载，但可以在 `--upgrade` 时**自动检测失活框架残留**（ACTIVE_FRAMEWORKS 减少了某框架但标记区块里仍有其 `_fw_*_check`）。

> **✅ 已落地**：基于 cordis 源码实证（`fiber.ts` DisposableList LIFO unwind / `reflect.ts` notify 定向失效 / 论文 Def 23 set之逆=unset、Def 25 满足判定 σ ⊧ d）的两项配套机制：
> ① **F2 满足判定显式化**（`gates-warn.sh check_framework`）：requires_conf 变量全空 → warn + 可执行修复指令（`--inject-frameworks` 重同步），不再静默不生效——对应论文 PENDING 态显式化；
> ② **F1 协效应定向失效**（`generate-skill.sh sync_framework_vars`，inject 尾部自动调用）：框架移出 ACTIVE_FRAMEWORKS 后，只被未注入框架需要且不被门禁正文引用的 conf 死变量**原位注释回收**（保守判定：须同时满足"不在活跃集 + 在未注入框架声明集 + 正文零引用"三条件，通用白名单如 EVAL_WHITELIST 因正文引用永不被回收）——补齐 merge_precheck_conf 只有"缺失补占位"没有"多余回收"的半边。
> 完整 undo（注入前快照 + ledger + `--rollback-frameworks`）与分层 patch（precheck.patch.conf 用户覆盖层）为后续候选（F4/F3）。

### 4.2 conf 变量——"声明式协效应"的缺失

swarm-yuan 的 171 个 conf 变量是**静态平铺**的：
- `SCAN_DIRS` 影响 `--sensitive`/`--security`/`--privacy` 三个门禁——但 conf 不声明这种依赖
- `--doctor` 能检测死变量（定义了无人引用），但**不能检测"变量改了但依赖它的门禁没被重新评估"**

Cordis 的"响应式协效应"启示：可以给 conf 加一份**变量依赖图谱**声明（哪些门禁依赖哪些变量），让 `--doctor` 能检测"配置不同步"。

### 4.3 分层组合——"档位过滤"vs"增量 patch"

swarm-yuan 的 lite/standard/compliance 三档是**档位过滤**（UNIVERSAL_FILES 数组按档整体过滤）。dsh 用**分层 patch**（标准档可以只 patch 核心档的某几行，而非全量覆盖）。swarm-yuan 的 profile 机制已经支持 `--profile auto` 自适应判定，但**不支持"只改某几个门禁的行为而不全量切档"**——这是未来演进方向。

## 五、AI 填充指南

目标技能 的 references/framework-knowledge.md 在 §"框架适配扩展机制"段引用本文：
- 注入框架门禁时说明"标记区块是可逆效应的轻量实现——重跑 inject 会先清空再重建"
- 设计 conf 时建议声明变量依赖关系（至少在注释里标 `# DEPS: --sensitive,--security`）
- profile 升降档时说明"升档是叠加（lite→standard 补齐文件），不是替换"

## 六、自检断言（G17）

- `self-check.sh` 守本文档存在性 + SKILL.md 整合 + facts.conf 口径（warn-only，与 G13/G14/G15 同构）
- `FACT_REFERENCES` 计数含本文档（值以 facts.conf 为准）
- `FACT_RUNTIMES_METHOD` 不含本文档（Cordis 非运行时，纯方法论吸收，与 context-engineering-layering 同档）

## 七、来源溯源

- 上游仓库：[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)（Apache-2.0，developer preview）
- 理论框架：[cordiverse/cordis](https://github.com/cordiverse/cordis) + [论文](https://github.com/cordiverse/paper)
- 吸收决策：决策 27（运行时升级整合纪律——吸收优先于新增门禁）+ 决策 26（复杂度负向预算）
- 本文件不复制上游源码或论文原文，只提炼方法论模式与 swarm-yuan 的对照映射
