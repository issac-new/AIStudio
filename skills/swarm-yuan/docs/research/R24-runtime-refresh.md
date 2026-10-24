# R24：运行时补核调研（claude-code 268 权限硬化修复轮 + dsh rc.2 回移 + 外围六行，2026-09-11）

- 调研角色：R24 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-11
- 触发：user message「自动更新Swarm-yuan项目（swarm yuan skill）research 目录下运行时（包括claude code、codex、deepseek harness等工具的版本变化情况）到最新稳定版本，比较和上一版功能差异，然后整合吸收其功能理念，优化swarm yuan skill」——与 R20/R22 触发语同型的周期性指令
- 上轮基线：2026-09-10 R22 补核（claude-code v2.1.267 / codex rust-v0.154.0 / dsh dsh-v0.1.5-rc.1 / 16 行全景）
- 数据来源：GitHub REST API + anthropics/claude-code CHANGELOG raw 抓取 + npm dist-tag（claude-code latest=2.1.268）+ 本地克隆 git fetch + 移动项 checkout（git describe 验证）
- 执行纪律（2026-09-08 增补，第三轮执行）：①本轮为**轻量补核轮**——三件套无 minor 实质移动（codex 零 stable 增量、claude-code +1 patch、dsh rc 点移动），按 R18 纯修复轮先例不开全量调研；②距 R22 收口为次日非同日；③patch 级外围移动只动表行与一行注记
- 登记口径：补核轮，不新增 references 文档、不进 FACT_RUNTIMES 13/5、不新增 check_* 门禁（守 55 预算，决策 26/26.2）；**patch/minor 级不发版**（R17/R18/R20 先例）

---

## 第一部分：点名三件套（claude-code / codex / dsh）

### 一、版本全景

| 运行时 | 上轮基线（R22） | 最新稳定（2026-09-11） | 跨度 | 备注 |
|---|---|---|---|---|
| claude-code | v2.1.267 | **v2.1.268**（npm latest） | +1 patch | 修复主导 + 权限硬化两连 + 工具死线原语；stable 通道仍 2.1.236 分裂持续 |
| codex-cli | rust-v0.154.0 | rust-v0.154.0 | **零增量** | 0.155 线全 alpha（alpha.3.4 = 2026-09-10 21:44 PDT，活跃未收敛） |
| dsh | dsh-v0.1.5-rc.1 | **dsh-v0.1.5-rc.2**（2026-09-10） | +1 rc 点 | web feedback + file refinements 回移 0.1.5 线，无方法论新原语 |

### 二、claude-code v2.1.267 → v2.1.268 深读（CHANGELOG 全量）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **符号链接目录 deny/ask 规则真实路径绕过修复** | macOS `/etc` `/tmp` `/var`、Linux `/bin` 等符号链接目录上的 deny/ask 规则，此前在以真实路径（realpath）给出时不生效；Bash 命令对写在符号链接拼写上的 deny 规则也被忽略 | **落地（注记级）——权限路径规范化第六实证**：路径检查必须统一在规范化空间比对（symlink 拼写 ↔ realpath 双向），否则规则可被拼写绕过。与 R23 D7 scope 门「工具链自有路径豁免」同类：**路径语义的规范化对账**。对本仓：scope 门/审批路径匹配已按字面前缀（`check_scope`），符号链接别名面登记为已知边界（单机生成场景低暴露，不升门禁） |
| **同行不可分析命令的 deny 规则失效修复** | `env -C`、`eval` 等权限检查器无法分析的命令与 deny 规则同行时，规则被跳过 | **落地（注记级）——「不可分析即最坏情况」fail-closed 又一实证**（与 267 managed 不可读→deny-all 同谱系）：检查器解析不了 ≠ 放行 |
| **WebFetch 300 秒硬死线** | 服务端保持响应不结束 → 挂死；现 300s 后失败，`CLAUDE_CODE_WEBFETCH_DEADLINE_MS` 可覆盖（0 关闭） | **落地——工具调用超时上限进宿主默认**：与 ocr `timeout_sec` 进 config、dsh 暂停即终止同族（用户时间主权 fail-closed）。对生成技能：**联网类工具须有显式死线**，宿主已兜底的记为环境事实 |
| gateway 定价透传 + `gatewayInternalNetworks` managed 设置 + `allow_cidrs` 空告警 | Claude apps gateway 的 `pricing:` 经 managed settings 下发使 `/cost` 与遥测一致；管理员可放行自有公网 IPv4 段；空 CIDR 启动告警 + 公网首请求一次性告警 | 注记——网关运营面，与 swarm-yuan 单机场景无交集；「配置缺省即告警」与 267 fail-closed 同向 |
| `claude self-hosted-runner --remove-session-state` | 会话结束时删 per-session 目录（默认关） | 注记——会话状态数据生命周期原语（可显式选择不留痕） |
| plugin 管理 `--json` + `errorDetails`/`noteDetails` | install/uninstall/update/enable/disable 机读输出 | 注记——插件管理面机读化（与本仓 CLI 机读输出教义同向） |
| 修复族（对账通过） | 第三方 Anthropic 兼容端点 Artifact schema regex 致 400（2.1.265 起回归——**宿主行为版本间不保证稳定第四次实证**）；长空闲会话 CPU busy-loop；respawned in-process teammate 拾取未信任目录同名 agent 文件（信任边界）；plugin/marketplace/MCP 配置中 token 与 `${VAR}` 机密展示泄漏；compact/resume 顺序稳定性 + SDK `excludeDynamicSections` 缓存中途破断（缓存稳定性第四波）；MCP 空 chunk 后消息为空；`$` 序列破坏 compact 摘要 | 对账通过。**机密不落展示面**（token/password/${VAR} redaction）与符号链接修复同为本轮安全硬化主轴 |

**2.1.268 判定：实质 patch（修复主导，两枚权限硬化 + 一枚工具死线值得注记）**。落地面 = `references/claude-code-capabilities.md` 版本注记段。

### 三、codex 零增量观察

0.154.0 仍为最新 stable；0.155 线 alpha.1→alpha.3.4 持续收敛（voice-cygwin 等特性分支合流中）。**不升基线、不开档**（alpha 不作基线，R13 起纪律）。

### 四、dsh dsh-v0.1.5-rc.1 → rc.2 快审

- 内容：`feat(web): backport feedback and file refinements to 0.1.5`（产物/反馈面细化回移）+ release commit。**无方法论新原语**。
- 判定：rc 点移动，升基线（rc 作基线 R17 先例），`references/dsh-engineering-methodology.md` 加 §十 一行注记。

## 第二部分：外围快审（13 行）

| 运行时 | 上轮 → 本轮 | 判定 |
|---|---|---|
| openspec | v1.13.0 → 零增量 | 对账通过 |
| comet | 0.4.0 → 零增量 | 对账通过 |
| GitNexus | rc.29（rc 线继续） | license-risk 不追（决策 18 维持），rc churn 不入表 |
| gsd-core | v1.13.0 → 零增量 | 对账通过 |
| claude-mem | v13.24.5 → **v13.24.10**（72 commits） | watch 行升级。快审：**凭据泄漏路径关闭**（#3985，安全）+ 配额熔断上浮至 observer-health/session-start 可见（熔断可观测性，与 R17 吸收的四规则对账）+ **CJK/日文 substring 检索**（非拉丁查询通路）+ sync 批次收缩与 hub push 超时 + Windows ghost listener 端口探测有界化（启动挂死修复）。watch 维持 |
| ocr | v1.11.7 → **v1.11.8** | 升基线。快审：**Rego policy review 支持**（规则面新语言）+ **预览选择与执行对齐**（所见即所扫——展示与执行口径一致族新样本，与 gsd「no-op 报真实条件」同族）+ LLM 流式 usage 默认请求 |
| graphify | v0.9.57 → **v0.9.58** | 升基线。快审：**python/php/bash import 解析**（跨语言边扩展）+ 同文件源路径碰撞合并修复 + SQL 索引 + rust static/const 提取——图谱完整性族延续 |
| superpowers | v6.3.0 → 零增量 | 对账通过 |
| gstack | v1.84.1.0 → 零增量（origin/main 仍 71f6048） | 对账通过 |
| ruflo | v3.40.0 → **v3.41.1**（minor + patch） | 升基线。快审：**x.ruv.io 开放 Nostr swarm federation 网关**（MCP + ruv:// + ws proxy）+ **公私 swarm channels**（ADR-386）+ **Seraphina（swarm queen）协调者**——R22 登记的 Federation+Claims 线产品化推进；3.41.1 两修复皆有方法论价值：**截断的推理 dump 不得作为协调指导报告**（「截断≠结论」，与「缺失证据不显示为零」同族）+ **memory 单 store 不得当全量计数**（口径诚实）。方法论引用层维持 |
| ECC | v2.2.1 → 零增量 | 对账通过 |
| codex-security | npm-v0.1.26 → **npm-v0.1.27**（30 commits） | 升基线。快审：patch/validation **复用 scan 认证**（认证态一致性）+ SDK pipeline 去重并发可配 + 「文档尺寸上限」从文档中删除（**不存在的能力不得写进契约**——诚实口径族）+ UTF-8 BOM 容错 |
| （better-harness） | v0.6.6 → 零增量 | 非表内方法论源，watch 维持 |

## 第三部分：落地载体清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | `docs/research/R24-runtime-refresh.md` | 本档 |
| 2 | `docs/upstream-baseline.md` | R24 口径注一行 + 7 行表行升级（claude-code/dsh/claude-mem/ocr/graphify/ruflo/codex-security）+ §二.2 关键结论 R24 句 |
| 3 | `swarm-yuan/references/claude-code-capabilities.md` | 新增「版本注记：v2.1.268」段（符号链接 deny 两连 + WebFetch 死线 + 机密不落展示面） |
| 4 | `swarm-yuan/references/dsh-engineering-methodology.md` | §十 0.1.5-rc.2 一行注记 |
| 5 | `swarm-yuan/references/subagent-orchestration.md` | R24 行（ruflo 3.41.1 截断≠结论 + Seraphina 登记） |
| 6 | `swarm-yuan/references/memory-persistence.md` | R24 行（claude-mem CJK 检索 + 熔断可见性 + 凭据泄漏关闭） |
| 7 | `swarm-yuan/references/review-methodology.md` | R24 行（ocr Rego + 预览=执行对齐） |
| 8 | `swarm-yuan/references/code-graph-tools.md` | R24 行（graphify python/php/bash import） |
| 9 | `swarm-yuan/references/codex-security-methodology.md` | R24 行（认证复用 + 契约诚实） |

## 第四部分：吸收对账（本轮「整合吸收」的克制结论）

1. **不升门禁、不改 SKILL.md**：本轮三件套无 minor 实质、无新治理原语进执法面。268 的网关/runner 族与单机生成场景无交集。R18 先例沿用。
2. **两条教义进 references 版本注记（非执法面）**：①路径规则的规范化比对（symlink 拼写 ↔ realpath）是权限系统已知硬点，本仓 scope 门按字面前缀匹配为**已登记边界**；②「不可分析即最坏情况」与「截断≠结论」并排，fail-closed/诚实口径家族跨宿主第三次会师（claude 268 / codex Guardian / ruflo 3.41.1）。
3. **工具死线环境事实**：WebFetch 宿主默认 300s 死线——生成技能的联网验证步骤无须自设超时兜底（宿主已兜），登记为环境事实。
