# plugin-tri-action-contract — 护栏类工具三动作契约

> 来源: wx-fusion-20261016 子卡 C5（t_cab304cd），文章B《Claude Code mod 开发手册》B1-B6 锚点。
> 裁决: FUSION-VERDICT-20261016.md §1/§5 —— 本文件是声明性契约（declarative contract），不改任何
> plugin 源码或全局 config；模型裁决守 §5（仅 aim / glm-5.3-flash 两档，本契约不涉模型）。
> 适用对象: hermes 集群一切「护栏类」工具——plugin（bundled backend）、guardrail skill 脚本、
> kanban 写护栏（触发器）、evals 探针 runner。给模型加知识与流程是 skill/SOUL 的活，不在本契约范围。
> 分档挂接: 本文件自身按 ~/.hermes/shared/context-layers.yaml 语义分档（见 §7）。

## 1. 三动作心智模型（B1）

事件/调用像在水管里往下流。护栏只能对水流做三件事之一；写任何护栏前，先在文档里声明本护栏用哪几种：

| 动作 | Claude Code 语态 | hermes 转译语态 | 安全级 | 适用场景 | 边界（什么时候不用） |
|------|------------------|-----------------|--------|----------|----------------------|
| 观察 | `await next(e)` 后看结果，不动任何东西 | 只读探针：跑扫描/计量，输出 verdict、日志、JSON（如 `pi_scan.py --json` 对良性文本返回 clean；guardrail-regress P5 观察探针只查 error.log 不写库） | 最安全 | 计量、审计、趋势、效力基线 | 需要阻断时不要停在观察 |
| 改写 | `next({...e})` 换掉下游看到的输入 | 净化后放行：对输入做中性化/剥除/截断，再交给下游（如 `sanitize_text.py --wrap` 剥伪造标签后入 context；入 prompt 前的第三方文本中性化） | 中 | 第三方内容进入模型 context 前；tool 参数注入预检后的放行路径 | 硬性禁止不靠改写；改写必须留改写前/后样本可 diff 复核 |
| 代答 | 不调 `next`，`return {deny}` 拦截接管 | fail-closed 拒收：非零退出码 / 数据库触发器 ABORT / kanban_block，由护栏给出结论（如 `pi_scan.py` blocked 时 exit 1；`kanban_guard_*` 触发器 ABORT 越权写） | 最高 | 恶意/畸形输入硬停；越权写拦截 | 正常命令被卡死=误伤，必须由对照探针证明不误伤 |

铁律：
1. **动作显式声明**：护栏的 SKILL.md/文档必须写明「本护栏 = 观察＋代答，无改写半边」这类声明；三缺一无声 = 违约。
2. **代答必须配对照**：每个「代答」护栏同时要有负例探针（该拦的拦下了）和对照正例（合法的不误伤）——只跑负例不算验收（fail-closed-gate-acceptance 铁律 1 的契约化）。
3. **改写可独立复核**：改写半边必须留「改写前样本 × 改写后样本 × diff」三件套证据，禁止只报「已净化」。
4. **工具描述保持陈述性**：护栏自身的 description 出现祈使式覆写信号本身就是异常（prompt-injection-guard `--tool-def` 模式的契约化）。

## 2. 状态宿主化纪律（B2）

Claude Code 侧的坑：模块顶层 `let readings = []` 在热重载时整体清零——状态必须放 `$.state` 由宿主代管。

hermes 转译：工具脚本进程每次调用即生即死，等价于「每次热重载」。因此：

- **跨调用状态** → 落盘文件（`state.json`、`evidence/*.txt`），路径写进护栏文档；重跑从盘上恢复（security-tool-acceptance-testing 配方二/三的 state 文件模式）。
- **跨任务/跨 worker 状态** → kanban db（comment / metadata / events），不复制进自己的文件。
- **会话级状态** → 交给宿主工具链（session/memory），不自造进程内缓存。
- **禁**：模块级可变状态承载跨调用语义；「上次结果」存内存变量；靠长驻进程记住任何判定依据。

机械判定：`grep -nE '^[a-z_]+ *= *(\[\]|\{\})' <护栏脚本>` 命中且该变量跨函数读写 = 违约；无状态（stdin→stdout）或状态落盘 = 合规。

## 3. API 版本权威条款（B4）

Claude Code 侧：`.claude-plugin/types/` 自动生成的类型声明是唯一权威；网上抄的代码在别的版本跑不通。

hermes 转译：**调用外部工具/API 前必须 `tool_describe` 先行拿当下 schema，禁止凭记忆或旧会话写参数**。

- 既有实践契约化：`tool_search` → `tool_describe` → `tool_call` 三步链是唯一合法调用序；跳过 describe 直呼 = 违约。
- 禁止：从训练记忆里抄工具参数形状；从别的仓库/别的版本抄调用代码不经本地验证直接用。
- 外部 CLI 版本敏感处：把实测的调用形状（命令原文 + 输出片段）写进护栏文档并注明验证日期；上游升级后旧形状作废，须重测。
- 依赖面最小化优先：能用纯 stdlib 实现的护栏不引第三方包（少一层版本漂移面）。

## 4. 程序化代答测试条款（B3）

Claude Code 侧：测试 hook 排在被测 mod 之后，替宿主作答——想让它返回什么假数据就返回什么，验证行为真跟着变。

hermes 转译：**护栏类工具必带「假数据回环测试」（零外网、零真实目标）**，由测试方喂合成输入，断言护栏输出跟着假数据变——证明护栏真在读输入，不是摆设：

- 引用 `devops/fail-closed-gate-acceptance`：负例独立构证（不复用开发者自己的负例集）；篡改负例逐字段各做一次；重放确定性必测（同输入连跑两次退出码一致）。
- 引用 `devops/security-tool-acceptance-testing`：配方一回环 fixture（本机 `http.server` 注入已知内容，零外网）；配方二状态机多轮 T1-T5（首跑静默/变更告警/复跑防抖/故障容忍/恢复）；配方五全库基线首跑（效力 = fixtures 检出率 + 真实面误报率双面数字）。
- 断言写到内容级别（verdict 字符串、退出码、净化后文本片段），不只数条数。
- 坏输入至少三类：空文件、坏 JSON/编码、未归类形态——断言降级而非 traceback。

## 5. CI 条款（B5）

护栏写错 = 危险命令放行或正常命令卡死，必须有测试兜住。护栏类 plugin/skill 变更必须带 validate + test 证据才能收卡：

- **安全回归常驻模式** = `~/.hermes/evals/guardrail-regress/`：`run_probes.py` 只读 `manifest.json`（单一事实源），探针定义、预期退出码、rationale 全在 manifest；runner 自身不内置任何探针——门在工具，事实在 manifest。
- 新护栏上线时：在 evals 下建平行 suite（或并入既有 manifest），登记正例+负例探针；收尾贴 runner 原始输出（退出码三态 0=全过 / 1=护栏失效 / 2=输入非法）。
- validate 的 hermes 等价物：语法检查（`python3 -m py_compile` / `bash -n` / `yaml.safe_load`）+ 本契约 §1 的动作显式声明齐备。
- 护栏变更 diff 里出现判定逻辑（正则/阈值/白名单）改动而无对应探针更新 = 拒收。

## 6. 边界：什么时候不用 plugin（B6）

| 需求形态 | 该用什么 | 不用 plugin 的理由 |
|----------|----------|--------------------|
| 某个事件上跑一段外部逻辑 | 设置 hook / cron 脚本 | 无状态、无界面，一次性执行即死 |
| 给模型补知识/流程规范 | skill / SOUL / AGENTS.md | 知识不参与事件链 |
| 硬性禁止某些操作 | 权限规则 / fail-closed 门 / kanban 写护栏 | 文本匹配类护栏可被别名、间接调用、内部脚本绕过（Blast Radius 定位：安全网非权限系统） |
| 长期驻留状态 + 随事件刷新的界面 + 插入事件链（三者任一） | plugin | —— |

hermes 侧默认序：**护栏优先做成 guardrail skill 脚本**（确定性、可回环测试、可审计、零常驻）；plugin 只在确实需要常驻+界面+事件链时才上，且装外部来源 plugin 按装依赖包同级评审（先读源码再装）。

## 7. 与 context-layers.yaml 的挂接

本契约的分档遵循 `~/.hermes/shared/context-layers.yaml`（C4 产物）的语义：

- **L1（常驻摘要档）**：触发词一行「护栏类工具变更/新增 → read plugin-tri-action-contract.md」——进 SOUL 或看板卡 body 的引用形态，全文不常驻。
- **L2（按需全文档）**：本文件全文。护栏开发/评审会话按需 `read_file` 拉取，计入单会话 ≤3 个 skill 全文的驻留预算。
- **L3（原始锚点档）**：验收证据（探针输出 `evidence/*.txt`、runner 原始输出、回归报告）——路径+行号引用，只在核对时定点读，永不整体注入。

变更本文件：platform 域 profile 提案制，遵守 FUSION-VERDICT-20261016.md §5（共享规则文件只由 platform 域 profile 改）。本文件不反向修改 context-layers.yaml（C4 权责）。

---
依据链：article-B-claude-code-mod.md:29-33（三动作）、:47（$.state 坑）、:77/226（测试替宿主）、:234（types 权威）、:253（CI）、:69/256（边界）｜fail-closed-gate-acceptance SKILL.md 铁律 1-4｜security-tool-acceptance-testing 配方一/二/五｜guardrail-regress manifest.json（P1-P6）。
