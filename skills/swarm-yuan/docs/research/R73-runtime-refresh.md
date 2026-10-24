# R73 运行时刷新档（2026-09-29，用户 /goal 三目标②触发）

## 结论

**4 移动 + 1 tip 快进 + 5 行登记表回欠账 + 13 零移动/记档**（19 行台账全覆盖，口径同 R57/R70/R71：只认稳定 tag，rc/alpha 不物化，main tip 漂移单列记档不计为版本移动）。

移动四件：**codex rust-v0.158.0 → rust-v0.159.0**（1 minor，89 提交）、**ruflo v3.47.1 → v3.48.0**（1 minor，发布工程轮）、**claude-code npm 2.1.283 → 2.1.284**（1 patch，2026-09-28T17:11Z 发布）、**codex-security npm-v0.1.31 → npm-v0.1.32**（1 patch，Codex CLI 基座升 0.158.0 + GPT-6 Sol xhigh 默认）。tip 一件：**gstack main 快进 +12 → 65bfb0c**（含 workflow-judge-cache 测试）。

**登记表欠账根治（本轮特办）**：`docs/upstream-baseline.md` 表行停在 R57 态——R58-R71 各刷新轮只写 research 档、未按执行纪律①回写表行（codex 0.157.0/ruflo 3.45.0/claude-code 2.1.282/graphify 0.9.67/claude-mem 13.25.3/superpowers 6.4.1/gsd-core 1.14.0/ocr 1.12.9/dsh rc.2 全部滞后于台账真值）。本轮一次性回填至 R73 态，11 行更新；此后每轮刷新必须回写表行（纪律恢复）。

**codex tag 世系甄别注记（新发现）**：rust-v0.159.0 不是 rust-v0.158.0 的严格后代——0.158 线有 17 提交未入 0.159 血统，但逐一核对全部为 cherry-pick 等价物（同 PR 号双现，如 #48824/#48686/#48621/#48549/#48513/#48352）。**codex 稳定 tag 走 release 分支切流而非 main 直接打 tag**，R71「稳定 tag 即近 tip」表述修正为「release 分支切流、内容与 main 同源（cherry-pick 双现）」。origin/main 领先 0.159 达 54 提交（记档不追）。

**dsh**：master tip 未动（4878cdab = 0.2.0-rc.1 发布提交），但出现 **dsh-v0.2.0-rc.2 tag 于 release 分支**（merge #5479，不在 master 线）——rc 不物化；stable 出线即深读（R70 预告口径顺延）。

## 台账（19 行，R73 态）

| 仓库 | R71/R72 基线 | R73 物化 | 移动 | 备注 |
|------|---------|---------|------|------|
| codex | rust-v0.158.0 | **rust-v0.159.0** | 1 minor（89 提交） | release 分支切流；origin/main +54 记档 |
| ruflo | v3.47.1 | **v3.48.0** | 1 minor | 18 内部叶包转 stable semver |
| claude-code | 2.1.283(npm) | **2.1.284(npm)** | 1 patch | 闭源无 changelog，npm 时间戳实证 |
| codex-security | npm-v0.1.31 | **npm-v0.1.32** | 1 patch | Codex CLI/SDK 基座 0.158.0 |
| gstack | main tip | **main tip 65bfb0c** | +12 快进 | workflow-judge-cache 测试 |
| dsh | main tip 4878cdab | main tip（未动） | 0 | rc.2 在 release 分支不物化 |
| graphify | v0.9.71（台账） | v0.9.71（checkout 对齐） | 0 | 表行欠账回填 |
| claude-mem | v13.28.0（台账） | v13.28.0（checkout 对齐） | 0 | 表行欠账回填 |
| superpowers | v6.4.2（台账） | v6.4.2（checkout 对齐） | 0 | 表行欠账回填 |
| gsd-core | v1.15.0（台账） | v1.15.0（checkout 对齐） | 0 | 表行欠账回填 |
| ocr | v1.12.10（台账） | v1.12.10（checkout 对齐） | 0 | 表行欠账回填 |
| better-harness | v0.6.6 | v0.6.6 | 0 | 0.7.0 仍全 alpha 线 |
| openspec | 1.13.2 | 1.13.2 | 0 | 与 R71 同 |
| comet | 0.4.3 | 0.4.3 | 0 | 与 R71 同 |
| ECC | v2.2.1 | v2.2.1 | 0 | 与 R71 同 |
| open-code-review | v1.12.10 | v1.12.10 | 0 | — |
| semantica | v0.7.0 | v0.7.0 | 0 | 与 R71 同 |
| gitnexus | v1.6.12+1 | v1.6.12+1 | 0 | v1.6.13 仍全 rc 线（rc.55）不物化 |
| pua | v3.5.1 | v3.5.1 | 0 | 与 R71 同 |

注：graphify/claude-mem/superpowers/gsd-core/ocr 五仓的版本移动发生在 R58-R61/R72 各轮（台账已记），本轮物理 checkout 从旧 tag 对齐到台账真值并回填登记表，非新增量。

## 移动明细

### codex rust-v0.158.0 → rust-v0.159.0（1 minor，89 提交）

方法论文档 `references/codex-methodology.md` 增 0.159 注记，此处记档要点：

- **Guardian 治理三连**：电路熔断中断的结构化错误 opt-in（#48796）、**Guardian 评审历史跨父压缩独立保留**（#48779——压缩不再吃掉治理证据链）、Code Mode 确认消息保留供评审（#48725）。
- **MCP 面强化**：单服务器状态发现+线程级连接复用（#48783）、app resource URIs 保留显示模式不默认改写（#48764）、Linux ETXTBSY 种族修复（#48727/#48724，夹具集中创建）。
- **性能**：idle 线程历史感知预热（#48812）、工具/技能上下文计量显式直方图桶（#48819——可观测性从计数走向分布）。
- **沙箱族**：Windows provisioning 服务启动等待（#48829）、限制性 Windows launcher 下嵌入式回落（#48491）、piped 子进程不弹控制台窗（#48483）、exec-server 许可私网上游代理（#48568）、macOS 网络化 Seatbelt 档 TLS 信任评估放行（#48565）。
- **渲染族**：Mermaid 流程图语法扩展（#48895）+ 标签标点/分号保留（#48814）+ 形状/关系/状态描述解析修复（#48489）、TUI 复制保 Markdown 表格与空白（#48549）、表格单元格源元数据保真（#48548）、空列表标记保留（#48623）、数学楔形表达式渲染修复（#48551）、终端配色列表标记（#48800）。
- **会话/线程**：首回合前可归档线程（#48828）、会话切换保空会话（#48628）且不再显示上一会话摘要（#48626）。
- **技能面**：技能目录跨执行器可用性稳定（#48353）、移除 bundled plugin-creator 技能（#48604）、移除 follow-up 建议默认值（#48621，改 opt-in——R71 已记 cherry-pick，0.159 正式收录）。
- **卫生**：WebSocket 头与工具载荷退出 info 日志（#48686，同上正式收录）、中性 TUI 中断通知（#48830）、turn 时长页脚（#48807）、Ghostty/Kitty 转录链接手型光标（#48827）。

### ruflo v3.47.1 → v3.48.0（1 minor，发布工程轮）

- **18 个内部叶包 alpha → stable semver**（#3514/#3530 线）+ 消费方指向稳定叶。
- **供应链见证例行重锚**：helper manifest 重签 + witness 重锚 + x-gateway 注册基线测试（af6d49a）——R70「供应链见证重锚定」第三轮例行化。
- **联邦公开注册守卫门控**（e69bc34，3.47.0 于 main 的受卫队注册）。
- 修复族：ChatGPT tool annotations 与行为对齐（#3525）、hive-mind 提交任务派发到 worker 并记录（#3524，3.47.1 主题延续）、analyze import 正则回溯爆炸修复+四种 import 形态覆盖（#3511/#3512）、安全扫描尊重 JSON/SARIF 输出格式（#3511）、CI AgentDB registry 预热（ADR-130 P3）。
- **方法论新原语：无**（发布工程轮）；「派发≠投递」与「重签例行化」两条既有谱系加深。

### claude-code npm 2.1.283 → 2.1.284（1 patch）

2026-09-28T17:11:59Z 发布（npm time 字段实测）。闭源无 changelog，仅记版本移动；本机 claude CLI 2.0.44 为用户工具面，不入 research 口径（R71 惯例沿用）。

### codex-security npm-v0.1.31 → npm-v0.1.32（1 patch）

- **Codex CLI/SDK 基座升 rust-v0.158.0**（#1076）——扫描器基座跟随 codex 稳定线。
- **CLI/SDK 默认 GPT-6 Sol xhigh**（#1078）——effort 档位默认值上移，与 codex 0.156.1 GPT-6 Sol 目录谱系同向。
- 修复族：no-change patch 必须验证（#1020——「验证必须有东西可验」诚实族）、私有扫描输出目录创建（#987）、diff 摘要在完成时计算（#1040）、重跑尊重请求的输出格式（#203）、workbench helpers 保留受信 Git 选择（#140）。

## 零移动/记档说明

better-harness 0.7.0 仍全 alpha；gitnexus v1.6.13 仍全 rc 线（rc.55，主干 tag 未出）；openspec/comet/ECC/semantica/pua 与 R71 同；harnesseval-w 与 origin/main 齐平；graphify v1.0.0 异源线第七轮未诱取（tag 面未变）。

## 部署副本同步

`~/.cc-switch/skills/swarm-yuan`（`~/.zcode/skills/swarm-yuan` 软链目标）：文本面经 rsync 对齐（排除 research/ 与部署本地 .claude）；research 克隆区本轮已原位 fetch+checkout 对齐（含五仓欠账 checkout 修正）。
