# R57 运行时刷新档（2026-09-25，用户 /goal 三目标②触发）

## 结论

**6 移动 + 10 零移动 + 2 无稳定 tag + 1 顺延**（19 行台账全覆盖）。

实质 minor 两件：**ruflo 3.42.5 → 3.45.0**（三个 minor，22 提交，主线是「路由智能化 + 记忆层可靠性 + 可观测诚实化」）与 **codex rust-v0.156.1 → rust-v0.157.0**（128 提交，网络出口策略升级为可撤销许可）。patch 四件：claude-code 2.1.280 → 2.1.282、openspec 1.13.1 → 1.13.2、codex-security 0.1.29 → 0.1.31、graphify 0.9.66 → 0.9.67。

物化 checkout：ruflo `v3.45.0`、codex `rust-v0.157.0`、openspec `@fission-ai/openspec@1.13.2`、codex-security `npm-v0.1.31`、graphify `v0.9.67`。claude-code 闭源无源码克隆，只走 npm 实测与台账行更新（2.1.282）。dsh 维持 alpha 注记顺延（无稳定 tag，远端最新 dsh-v0.1.7-rc.2 非稳定线）。

**本轮自纠错（台账执法实录，第四次）**：graphify `v1.0.0` tag 再次被诱取，本次以四重证据裁决驳回并改 checkout `v0.9.67`——① v1.0.0 提交日期 **2026-04-05**，比 v0.9.67（2026-09-23）早约 5.5 个月；② 提交者展示名 `Safi <...>` 与主线近 300 提交的 `safishamsi <...>` 异形（邮箱同）；③ **tag 名 `v1.0.0` 与包内 `pyproject.toml` 声明版本 `0.1.10` 自相矛盾**，v0.9.67 二者一致；④ v1.0.0 自带 `release: 0.1.5`/`bump to 0.1.6` 提交，属早期原型序列，与 0.9.x 主线不衔接。这是该陷阱第四次被实录（R32 首次、R41 复核、R44 再触、R57 四触）——「checkout 动作必须先过台账裁决列」纪律持续有效。保留一项：本克隆为 shallow，「两者永无共同祖先」超出可证范围，但上述四项独立证据已足。

## 移动明细

### ruflo v3.42.5 → v3.45.0（实质 minor，22 提交；CHANGELOG 停在 3.34.0 未随版本更新，证据以 commit + 代码锚点为准）

- **任务路由新增可拒绝（abstain）的类型安全语义决策层**（`7d801171d`；`v3/@claude-flow/cli/src/ruvector/typesafe-router.ts:146-149,219-228`）：句子嵌入做类型化选择，默认关闭（`CLAUDE_FLOW_ROUTER_TYPESAFE=1` 开启），动态 import、任何加载/决策错误静默回退。带三重门禁——abstain ≤ 0.30、lift ≥ 1.2、top-1 margin ≥ 0.005；结果暴露 `routedBy/confidence/abstain/calibrated/lift`，内置选择保留在 `fallbackRoute`，**未校准置信度绝不写入 `successProbability`**。
- **关键词路由改词边界匹配**（`8080d872a`；`hooks-tools.ts:791-801`）：修 `'test'` 命中 "latest"、`'auth'` 命中 "author" 的子串误路由，改预编译 `\b` 锚定正则。
- **记忆嵌入自愈，消灭静默 NULL 向量**（`44883dbd1`；`memory-bridge.ts:771,843,973-983,1141`）：`generateLocalEmbedding()` 拆出本地链路不再 bridge-first（否则本地状态记成 `model:null`、永远哈希回退、rescue 探测永不可达）；产不出向量时显式上报 `embeddingError`/`hasEmbedding`，不再裸 catch 存 NULL。
- **图边写入器 WAL 句柄空闲自释放**（`72e17533c`；`graph-edge-writer.ts:58-70,89`）：原模块级单例句柄永不关闭，`-wal/-shm` 残留导致后续 `memory_store` 被 sidecar 守卫永久拒绝（Windows 上一次 `hooks_post-task` 即致整个记忆存储瘫痪）。现 1s 空闲 checkpoint + 关闭，写前显式 `releaseBridgeDb()`。
- **策略状态写盘原子化加固**（`5f3f4df40`；`policy-runtime.ts:74-94`）：`writeJsonAtomic` 对 Windows 瞬时 rename 失败做有界退避重试 + `finally` 清临时文件。动机：state.json 携带**哈希链回执账本与一次性审批用量**，写失败会返回幻影回执、使一次性审批可被复用。
- **学习回执诚实化**（`9e71cf66d`；`hooks-tools.ts:1766-1796`）：不再按成功标志编造 `patternsUpdated=2/newPatterns=1/trajectoryId=traj-<时间戳>`，改报控制器实测计数（不可用则 0），`newPatterns/trajectoryId` 为 null，`learningUpdates` 增 `available+reason`，CLI 打印 "Learning degraded" 警告而非假数字。
- **v3.44.0（ADR-389/390/391）**：路由器 helper 纳入签名刷新防安装副本漂移（`82dac70fd`；`helper-refresh.ts:80-90,308`）；语义路由接真实 MiniLM 嵌入（384 维，`CLAUDE_FLOW_ROUTER_EMBEDDER=minilm|hash`，**默认仍 hash**）；**冻结 197 条标注 prompt 语料（sha256 固定）+ AND 门禁决定默认值切换**——准确率 +>2 点 **且** warm p95 延迟回归 ≤5% **且** 不新增必需依赖才晋升。首测 MiniLM +10.6 点准确率但 p95 +485%，**无候选通过，故默认不切换**，基准回执入库并把未采用发现记为「owner decisions, not applied」（`v3/docs/adr/ADR-391-router-benchmark-gate.md:48-52,86-101`）。
- **v3.45.0**：依赖精确钉死（`@claude-flow/memory` 由 `^3.0.0-alpha.23` 钉 `3.0.0-alpha.25`，dependencies 与 optionalDependencies 双写）+ `doctor` 新增「CLI 实际加载副本 vs 声明范围」体检，结论定 **warn 而非 fail**（CI 里 npm 提升的副本本就可能合法不同，fail 会让退出码取决于包管理器布局）（`6ff6fded3`/`a35901de8`；`doctor.ts:1049-1076,1109`）。

### codex rust-v0.156.1 → rust-v0.157.0（实质 minor，128 提交；发布说明在 tag 首提交 `00c972ed5`，根 CHANGELOG.md 只指向 releases 页）

- **网络出口策略成为「可撤销许可」，贯穿全传输栈**（`888e02db3`/`22a3f6d5d`/`8f8ace78c`/`db3cb33ec`/`9d4d34d43`）：每个 redirect 目的地、响应体读取、WebSocket 读写都持 permit；策略收紧即取消在途请求；**策略拒绝不可重试、且不记为成功**；策略加载失败直接断网（fail-closed）。
- **Guardian 评审线程上下文默认开启 + 双层策略注入**（`279ba8941`/`26cb4d73e`/`99784bd09`/`30daed37a`）：评审器默认吃完整线程上下文，租户策略 + `extra_policy` 注入评审模板与 v2 分类器；**后续用户输入会使在途评审的授权失效**。
- **多代理派发收敛到单一入口并做孤儿清理**（`f908e5a96`/`5121aeff1`/`acc20df49`/`c46aa58a7`）：`SpawnRequest`/`LocalAgentControl::spawn` 统一 spawn、归属与规范路径校验；临时子代理取消/启动失败即拆除存储态、关闭 spawn edge；**驱逐与排队消息互斥**（pin 住收件方直到队列清空）。
- **压缩检查点内嵌恢复元数据**（`e7bbc79f4`/`286d4ecf4`）：`CompactedItem.resume_metadata` 记录多代理版本、最后起始 turn、上轮设置，与压缩检查点在设置持久化锁内同写；resume 从最近压缩边界起，缺失字段才回退全量重放。
- **MCP 来源归属成为跨状态持久的证据**（`ac9853767`/`0d7f10b87`）：累计 MCP 来源与首发 turn 跨 compaction/resume/fork 持久，随 `client_metadata.mcp_attribution` 模型外上报（限 OpenAI HTTPS、16 KiB 上限），失败保留诊断原因（`payload_too_large` vs `serialization_failed`）。
- **有界重试与显式恢复**（`2c3295306`/`171dd0d39`/`811fe5fa4`/`d6093d322`）：上传 5 次/5 分钟共享预算 + 尊重 Retry-After + 每次重试新开内容流；turn 结束/中断/失败时回收未发送问答草稿进 composer；后台 daemon 配置不兼容给「不用/重启/取消」三选一且**默认取消**。
- **技能目录按认证作用域/代际缓存**（`8edfca892`/`f3037cafd`）：每 turn 可取消地发现一次，快照供提示与工具读取；认证作用域变化即失效，**迟到的发现/读取结果按被替换的代际拒收**。
- 注入面卫生：本地 MCP 只继承 stdio 描述符、MCP OAuth 端点限 http(s)、daemon socket 路径经祖先 bind mount 泄露则掩蔽、**作者不收自己帖子的通知**。

### claude-code v2.1.280 → v2.1.282（patch 两版；npm latest 实测 2.1.282；闭源二进制，仅发布说明级证据，机制内部实现「未验证」）

- **权限模型堵旁路**（281）：命令替换里的递归 `rm`（如 `rm -rf "$(pwd)"`）此前绕过 Bash 允许规则直接执行，现强制提示；NUL 字节权限规则误展开为通配符已修。（282）：settings 中带中间 `:*` 的 Bash 规则被跳过已修；**managed 布尔锁键打错值不再被忽略**、嵌套非法值使整个 managed 块失效；managed `allowManagedPermissionRulesOnly` 下 `allowed-tools` 自我预授权被封堵。
- **危险命令等待有界化**（281）：危险 `rm` 提示等待 2 分钟后自动 deny 并给改写提示——「无界等待→有界」族。
- **重试与恢复诚实化**（281）：无限重试无视 `--max-turns` 已修；`CLAUDE_CODE_RETRY_WATCHDOG` 在 429/529 等待后失效修复；代理截断的响应不再显示为完整；resume 期间工具调用结果标为 unknown。（282）：`redacted_thinking` 损坏时丢弃 thinking 块并重试一次；**compaction 摘要被拒时改用 fallback 模型重试**；磁盘配额错误不再伪装成「Exit code 1」。
- **resume/持久化保真**（281/282）：resume 重发「被改写的早期轮次」（并行工具调用轮、MCP 工具输入、tool-search 结果）已修；`--continue/--resume` 重发旧消息、恢复提示上已批命令二次执行均已修。
- **路径围栏**（282）：CLAUDE.md/rules 经仓库符号链接读到 macOS `/Network`、`/.vol` 路径已修——与 openspec R57「artifact 输出路径限制在 change 目录内」同族。
- **安全/治理面**（281）：gateway 拒绝 `\??\`、`/??/` 开头的 `envHelper` 路径（NT 路径前缀走私）；自托管 runner 改用私有文件传 system prompt（argv 不可见）；`claude plugin validate` 增 MCP server 检查；`"attribution": false` 可关闭 commit/PR 归因。（282）：启动与 `/status`/`claude doctor` **显式列出被忽略的遥测变量**（静默失效可观测）。

### openspec 1.13.1 → 1.13.2（patch，32 提交 +4624/-759，校验与守卫口径改动扎实）

- **verify 按 delta 分区判定需求**（`3364146`, #1962）：先读需求坐在 ADDED/MODIFIED/REMOVED/RENAMED 哪一节再定检查方向。REMOVED 反向查——查不到才正确、行为仍在才 critical；RENAMED 旧名不再报 missing。此前一律当「查实现」，**正确删除的需求被判 CRITICAL「Requirement not found」并建议补实现**，等于指挥 agent 把刚删的行为加回来。
- **未验证维度不得报通过**（`072de6b`, #1732）：schema 未定义 tasks/specs 时原逻辑空转、末尾照样输出「All checks passed. Ready for archive.」。现改为记分卡标 `Not verified`，终评必须点名，任一检查未跑就不得宣称可归档。
- **解析器诚实性：不读不存在的字段**（`d6bdef6`, #1731）：模板让 agent 从 `openspec list --json` 读 `schema` 字段，而该命令契约只返回 name/completedTasks/totalTasks/lastModified/status，字段永不存在、fallback 恒触发，自定义 schema 被显示成 `spec-driven`。改为从 `openspec status --change --json` 的 `schemaName` 解析，并加契约守门测试。
- **诊断给全对比两侧**（`a5ceea3`, #1809）：scenario-loss 守卫原本只报 MODIFIED 块丢掉哪些场景，现补「新增了几个、叫什么」，使「重命名」与「截断」可区分；validate 与 archive 共用一句输出防漂移。
- **破坏性操作守卫（归档原子认领）**（`f2812f6`, #1926）：清理阶段每个条目先用 atomic rename「认领」再读取，认领结果与副本比对——复制窗口内写入的文件要么被比对发现并还原，要么落到原路径成新文件、永不被删；回滚只剪自己建的那个 capability 目录。
- **路径围栏**（`fd56e12`, #1885）：artifact 输出 glob 支持 brace expansion 与 extglob，但展开后路径被限制在 change 目录内，字面文件名保持原义。
- 其余：CRLF/LF 主导行尾在重写时保留（`1d35e90`）；`validate --strict` 的 TODO 占位判定要求大写或后接标点，避免误判西语/葡语「Todo el…」（`8826c0c`）；任务组各自落自己的测试与文档、不许拖到尾组（`ed5d386`）。

### codex-security npm-v0.1.29 → npm-v0.1.31（patch，25 提交 +22959/-9268）

- **finding 归属人建议 + 证据链**（`cbbb8d9`, #1010）：`suggest-owners.ts` + `owner-evidence.ts` 从已提交源码与 Git 证据推断 finding owner，只读 committed object（脏文件、符号链接不跟），`GIT_NO_LAZY_FETCH=1` 防隐式拉取。输出 `status: identified|abstained|error` + `evidence[]` + `limitations[]`，**允许弃权并说明局限**。
- **CWE 映射进 finding 契约**：`finding-schema.ts` 用 Ajv 2020 校验 Finding schema（含 provenance），`cwe_ids` 用正则 `/^CWE-[1-9]\d*$/u` 卡住，`taxonomy: { category, cwe: ["CWE-79"] }` 进 SARIF。测试用例含 `[" cwe-089 "]`、`[]` 等脏输入。
- **观测记录去重走 host 复核**（`e25126f`, #946）：`records-protocol.ts`（JSON-RPC 2.0，`run`/`cancel`）保留原始 observation ID 与显式候选关系，host 侧执行复核。
- **审计门禁口径**（`39f2401`, #996）：deep-scan **只有显式标为 scan-fatal 的 worker 错误才终止**，通用 OS 错误改为有界重试——防止偶发错误把整次审计判死。（`e268029`）full-output 扫描失败按 error 上报而非静默。（`b2b7a00`）文档明写本地 Git hook 是 **advisory、不可作为信任根**。
- **检测规则补漏**（`cce8231`, #989）：`.m` Objective-C 实现文件缺失于共享文本/代码扩展白名单，导致只改 .m 的变更 diff scope 为空；补入白名单但走采样文本路径（因 MATLAB 同用 `.m`）。威胁模型 artifact 本轮 15 行微调，**无实质方法论增量**。

### graphify v0.9.66 → v0.9.67（patch，20 提交 +1432/-52；v1.0.0 异源见「自纠错」）

- **PHP 闭包提取**（`cd3fd94`→`95dd8cf`, #3409/#3461）：匿名 `function(){}`、箭头 `fn()=>`、作参数传入的闭包均产生节点并捕获内部调用。路由闭包经 `_php_get_route_name` 沿 AST 父链收集 `group()` 前缀，合成语义名 `VERB /path`；非路由闭包用按 scope 计数的稳定序号 `{closure#N}`；嵌套闭包不许继承外层路由名（`904deae`）。
- **Python 绝对包导入解析**（`2944b2d`→`f2b65b7`, #3729）：`import pkg.sub` / `from pkg.sub import x` 在 scan root 内解析到本地包/模块节点，复用规范解析器（有界遍历、PEP 420 namespace）；**跨树同名模块歧义时 fail closed 而非随意绑定**。
- **幽灵环回撤**（`310b317`+`f2b65b7`, #3784/#3777）：`pkg/` 包与 `pkg.py` 模块同名不再产生虚假 import 环。只回撤匹配模块文件 id 的临时边，且**删掉了 `len(loc_candidates)==1` 的盲回落**——那会误删 #3729 后合法解析到 `pkg/__init__.py` 的唯一边（`graphify/extractors/resolution.py:1433` 起注释写明「为何 `__init__.py` id 不进回撤候选」）。
- **导出幂等**（`3454890`, #3060）：`export` 不再每次重写未变的 wiki/Obsidian 页面。原做法开头 `unlink` 全部 `*.md`，导致上万页全量重写 + 导出中途 wiki 目录空窗；改为先写出、收集 `produced` 集合，末尾只扫孤儿。新增 `write_text_atomic_if_changed`。
- **Terraform 密钥脱敏扩到 list**（`7b2ac86`, #3644）：`configs = [{ password = "…" }]` 此前原样漏进 graph.json 与 MCP 查询面；`_redact_value` 补 list/tuple 分支。
- **Windows hash-seed 回归**（`d9d4756`, #3780）：确定性 pin 原靠回放 `sys.argv[0]` 重 exec，uv/pip/pipx 装的 Windows 原生 stub 不是可执行 Python 内容，全部命令当场失败；改为 `python -m graphify` 重 exec。

## 零移动核对记录（10 行）

ECC v2.2.1 / better-harness v0.6.6 / claude-mem v13.25.3 / comet 0.4.3 / GitNexus v1.6.12 / gsd-core v1.14.0 / ocr v1.12.9 / pua v3.5.1 / semantica v0.7.0 / superpowers v6.4.1——远端稳定 tag 与本地一致，零移动。

## 无稳定 tag / 顺延（3 行）

- **gstack**（本地 a6b3a57 / v1.87.5.0）与 **harnesseval-w**（本地 ed4ccc6）：远端无稳定 tag 可取，维持现状。
- **dsh**：远端最新 dsh-v0.1.7-rc.2 非稳定线，按「下一条稳定 tag」注记顺延，基线不动。

## 吸收三段

本轮吸收按「机制级吸收，不整包」口径，落到 `references/` 三处 + `assets/facts.conf` 注记。核心是四条横切机制：

1. **未跑的检查必须记 `Not verified`，终评不得宣称就绪**（openspec `072de6b`）+ **验证按操作语义分区判定**（openspec `3364146`）：跳过维度写进记分卡，全绿结论要求所有维度有实测；ADDED 查存在、REMOVED 查消失、RENAMED 不查旧名。直击「正确删除被指挥回滚」与「未跑即报通过」两类误判，与本仓「不隐瞒失败」红线同根。
2. **归因/结论必须附证据链并允许弃权**（codex-security `cbbb8d9`）+ **硬失败只认显式标记，通用错误走有界重试**（codex-security `39f2401`）：三态输出（identified/abstained/error）+ `evidence[]`/`limitations[]`；错误分类仅 scan-fatal 终止。替代自信猜测与偶发 IO 误杀。
3. **门禁从「一次检查」升级为「可撤销许可」**（codex `888e02db3` 等）+ **检查点自带恢复元数据**（codex `e7bbc79f4`）+ **派发原子性与孤儿清理**（codex `f908e5a96`）：策略变更作废在途许可、deny 不可重试；resume 所需状态写进检查点本体；临时子代理失败即回收、已受理排队消息不被驱逐。
4. **新能力默认关、可拔除、可测量 + 冻结语料 AND 门禁决定默认切换**（ruflo `7d801171d`/`82dac70fd`/ADR-391）+ **失败面显式化而非静默降级**（ruflo `44883dbd1`/`9e71cf66d`）：opt-in + 动态 import + 出错静默回退；197 条冻结语料 sha256 固定、准确率与延迟双过才晋升（首测 +10.6 点但 p95 +485% 故不切换）；`embeddingError`/`available+reason`/「Learning degraded」显式告警。

配套两条骨架级模式（入 `references/agent-skills-methodology.md`）：**破坏性操作「atomic rename 认领」后再读、比对确认才删**（openspec `f2812f6`）与**导出/重生成必须幂等**（graphify `3454890`，`write_text_atomic_if_changed`）——后者与本仓 AGENTS.md「内容比对而非 mtime」要解的是同一问题。

## 台账同步

`docs/upstream-baseline.md` 六行更新（claude-code / codex-cli / ruflo / openspec / codex-security / graphify），各带本轮吸收注记与 `baseline_status=synced`。graphify 行加注「v1.0.0 异源 tag 第四次诱取已拒」。
