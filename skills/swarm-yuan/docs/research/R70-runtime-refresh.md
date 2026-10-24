# R70 运行时刷新档（2026-09-28，用户 /goal 三目标②触发）

## 结论

**4 移动 + 9 零稳定移动 + 2 无稳定 tag + 4 主线漂移记档**（19 行台账全覆盖，口径同 R57：只认稳定 tag，main tip 漂移单列不计为版本移动）。

实质 minor 一件：**ruflo v3.45.0 → v3.47.0**（两个 minor：3.46.0/3.46.1/3.47.0，主线是「Windows 注入面收口 + 供应链见证重签 + 记忆 upsert 语义修正 + 联邦注册受控化」）。patch 三件：**graphify v0.9.67 → v0.9.71**（R6 类系统/SQL 触发器/Groovy 枚举抽取 + Windows watch 锁 + Fortran 安全修复 GHSA-pcc4-rv…）、**claude-code 2.1.282 → 2.1.283**（npm 实测）、**superpowers v6.4.2**（main==tag，一轮内自然追平）。

**无新稳定 tag 但主线大幅推进（记档不物化）**：codex 稳定线停在 rust-v0.157.0（0.158 全线 alpha，最新 rust-v0.158.0-alpha.13），主线 09-24→09-28 线内约 277 提交已全量拉取分析（Guardian 结构化中断错误、MCP 单服发现+连接复用、历史感知预热、Mermaid 渲染扩展、Windows 沙箱加固）；dsh 无稳定 tag（alpha 顺延惯例），tip 到 dsh-v0.1.7-rc.2+155（09-27），657 提交主题为插件束系统 + OTel 遥测 + 桌面/Web 双端。本地克隆两处（research/ 与 ncwk/upstream/）均已同步；codex/minimax 的 3 个本地提交已存档至 research/../offline-cache/local-commits-archive/ 与 /tmp/runtime-local-commits-* 后对齐（内容为一次版本探测残留与一个未合并上游 PR #47899 的 cherry-pick，均非吸收产物）。

**本轮台账陷阱零新增**：graphify v1.0.0 异源 tag 未再被诱取（第五轮次直防——creatordate 过滤即天然排除）；ncwk/hermes-studio 的 v1.0.0-v1.0.4 异源 tag 线在目标①甄别为「打在旧提交上的假新版」（v1.0.4=2026-09-18 是 v0.7.24=2026-09-22 的祖先），已拒并记档于 ncwk 侧。

## 台账（19 行）

| 仓库 | R57 基线 | R70 物化 | 移动 | 主线漂移（tag 后提交数） |
|------|---------|---------|------|------------------------|
| ruflo | v3.45.0 | **v3.47.0** | 2 minor | 0（tag 即 tip 线） |
| graphify | v0.9.67 | **v0.9.71** | 4 patch | 0 |
| claude-code | 2.1.282(npm) | **2.1.283**(npm) | 1 patch | 闭源无克隆 |
| superpowers | v6.4.x | **v6.4.2** | 追平 | 0（main==tag） |
| codex | rust-v0.157.0 | rust-v0.157.0 | 0 | ~915（0.158 alpha 线不计） |
| codex-security | npm-v0.1.31 | npm-v0.1.31 | 0 | +20 |
| openspec | 1.13.2 | 1.13.2 | 0 | +1 |
| comet | 0.4.3 | 0.4.3 | 0 | +1 |
| ECC | v2.2.1 | v2.2.1 | 0 | +152 |
| gsd-core | v1.15.0 | v1.15.0 | 0 | +45 |
| open-code-review | v1.12.10 | v1.12.10 | 0 | +1 |
| semantica | v0.7.0 | v0.7.0 | 0 | +46 |
| better-harness | v0.6.6 | v0.6.6 | 0 | tip 在 0.7.0-alpha2 线（不物化） |
| claude-mem | v13.28.0 | v13.28.0 | 0 | +1 |
| gstack | — | main tip | 0 | 无稳定 tag，保持 tip |
| harnesseval-w | — | main tip | 0 | 无稳定 tag，保持 tip |
| dsh | alpha 顺延 | main tip（v0.1.7-rc.2+155） | 0 | 无稳定 tag，657 提交记档 |
| gitnexus | — | main tip | 0 | 仅 rc tag，保持 tip |
| pua | v3.5.1 | v3.5.1 | 0 | 0 |

## 移动明细

### ruflo v3.45.0 → v3.47.0（实质 minor×2）

- **Windows 注入面收口**（`6adbb393e`）：浏览器工具产出的文本永不经 Windows shell 直传（工具文本注入防护从「参数级」升到「传输级」）。
- **供应链见证（witness）重锚定 + 重签**（`455ce575f`/`d37f283c6`/`3b00a3398`）：package.json 标记重锚、helpers manifest 按 3.46.x 重签——版本发布与见证账本原子绑定，防「发版后见证漂移」。
- **记忆 upsert 语义修正**（`7f6fd2d76`）：namespace+key 二元组在 upsert 中不再互相覆盖（同 key 不同 namespace 原先静默合并）；`4c226bd19` 保住 Claude 记忆分节完整性。
- **联邦注册受控化**（`09595b70b`）：公开注册加守卫（guarded public registration），配合 3.47.0 发布——联邦面的准入从「默认开放」转「受控」。
- **doctor 诚实化两件**（`6096bcaeb`/`11e04bfc5`）：原生 AgentDB 存储完整性检查 + SONA 轨迹范围/存活计数如实上报。
- **dream() 评估面修复**（`a91db6768`/`47c5dd408`/`34e4bb400`）：EMA 方向反转、先验衰减 env 接线、MoE 负载均衡损失接线——评估层修的是「度量本身」，与 R57 的 ADR-391 基准门禁同一纪律。

### graphify v0.9.67 → v0.9.71（4 patch）

- **R 语言类系统两连修**（`aa2584c`/`a4c6323`）：R6 的 `self$`/`private$` 类内方法调用解析 + 命名空间限定构造器识别（`R6::R6Class`）——代码图谱平权选型的 R 面补齐。
- **SQL 触发器 + Groovy 枚举抽取**（`d7e463e`/`4536c5c`）：触发器关联到表、枚举及其常量入图。
- **Windows watch 锁序列化**（`e4a6f50`）：msvcrt 锁消除重建竞态；**Fortran 安全修复**（`e1d9dee`，GHSA-pcc4-rv…）：`#include` 预处理前剥离（cpp 注入面）。
- **wikilink 索引尊重 ignore 规则**（`57a263c`）；Python 嵌套 scan-root 导入经命名空间投影解析（`c66eebe`）。

### claude-code 2.1.283（npm 实测；CHANGELOG 全量核对）

- **模型治理三原语**：`availableModelsMatch: "exact"`（白名单改精确匹配，新版本默认封锁直到显式列出）+ `deniedModels`（黑名单独立于白名单生效）+ 二者组合的 managed settings 语义。
- **`/doctor prompt-audit`**：审计 CLAUDE.md/skills/agents/commands 里「为旧模型写的提示模式」——提示资产也有了版本健康检查。
- **网关提示头**：`x-claude-code-prompt-id`（`CLAUDE_CODE_GATEWAY_HINT_HEADERS=1` 开启）让 LLM 网关按用户 prompt 分组请求——多代理共享网关的归因面。
- **OTel `tool.output` span**（`OTEL_LOG_TOOL_CONTENT=1`）：MCP/WebFetch/WebSearch 产出进遥测——可观测性与内容审计的接缝。
- **插件校验硬化**：`plugin validate` 拒绝装不上的名字/逃逸路径（outputStyles/themes/monitors/lspServers 指向插件目录外即 fail）；`installed_plugins.json` 坏记录不再静默丢档，命令会点名记录并给恢复路径。

### codex rust-v0.157.0 后线内（~277 提交，09-24→09-28，不物化只记档）

- **Guardian 结构化中断错误**：circuit-breaker 中断改为 opt-in 结构化错误（错误成为一等公民而非字符串）；Guardian 历史跨父压缩独立保留（评审证据不再被 compaction 冲掉）。
- **MCP 单服发现 + 连接复用**：MCP status discovery 不再全量扫描，单服务器按线程复用连接。
- **历史感知预热**（idle threads prewarming）：空闲线程按历史预热的调度策略。
- **Mermaid 渲染扩展**：流程图语法扩展 + 标点/分号保留 + 形状/关系/状态描述解析——TUI 内渲染保真度。
- **Windows 沙箱加固**：ETXTBSY 竞态消除（可执行 fixture 集中创建）、受限启动器下回退 embedded 模式、pip 子进程不弹控制台窗。

### dsh v0.1.7-rc.2+155（无稳定 tag，alpha 顺延；657 提交 09-22→09-27 记档）

- **插件束（bundle）系统成型**：Schedule 作为可选束发布（束内自带行集合 + 列表），行级开关与束级开关联动（单独切行被拒、束切行随动）；**DSH 对等兼容性强制 + 精确豁免**（typed refusals 上报不兼容版本）。
- **遥测双通道**：OTLP 字节有界会话日志上传 + 桌面端 OTel 产品分析。
- **动态工具更新投影**：LLM 侧动态工具更新按路由投影（`llm: emit dynamic tool updates and project them per route`）。
- **会话归档 UX 三态化**：显式三向菜单（全部/仅归档/未归档）+ 图标化空态。

## 吸收落点（本轮新增至 references/）

1. **claude-code-capabilities.md** 版本注记 v2.1.283：模型治理三原语 / prompt-audit / 网关提示头 / OTel 工具内容 / 插件校验硬化。
2. **codex-methodology.md** 版本注记（R70）：结构化中断错误 / MCP 单服发现 / 预热 / Windows 沙箱纪律。
3. **dsh-engineering-methodology.md** §十一：插件束兼容性治理（对等版本强制 + typed refusals）与遥测双通道。

## 与既往轮的关系

R57（09-25）后的第二次全量刷新。codex「v1.0.0 异源」陷阱家族本轮在 ncwk/hermes-studio 复现变种（v1.0.0-v1.0.4 线），处置口径与本档 R57 四拒一致：提交祖先关系 + 提交者异形 + 版本声明自洽性三证裁决。
