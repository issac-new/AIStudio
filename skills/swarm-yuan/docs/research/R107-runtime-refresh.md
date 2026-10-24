# R107 运行时例行刷新轮（2026-10-12）

> 触发：用户 /goal 三目标（「research 目录下运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版」目标）。口径同 R106 例行轮：research/ 克隆升级到最新稳定 tag、差异过决策 46 两问后吸收、表行回写。本轮号位 R107。

## 一、移动面（4 移动，15 行零移动）

| 运行时 | 旧基线 | 新基线 | 跨度 | 实质判定 |
|---|---|---|---|---|
| graphify | v0.9.85 | v0.9.86 | 1 patch（20 提交） | 实质（**产物单行紧凑 JSON**——重建 diff 从数万行降到一行，产物形态为评审者设计；**查无此名 exit 3/4**——弃权语义机读化；去重路径按扫描根锚定；Rust grouped use 展开） |
| ruflo | v3.56.5 | v3.56.7 | 2 patch（143 提交） | 中等（**去重前先快照 store ids**——无 id 实体不得被去重吞；TUI Swarm/Events/Missions 观测页+只读钉定 AI 页；MCP resources；Codex 版本串比较） |
| gstack | main tip db74567 | main tip e23f7b80（v1.91.93.0） | +39 提交 | 中等（**review-gates fail closed on unparsed severities**；发布报告门禁要求仓库已完成；codex_reviews consent 执法；stamp-at-merge 自举发布；Windows LF/Git Bash hook 修复批） |
| semantica | main tip 320761de | main tip d47696a2 | +20 提交 | 薄（修复批：temporal CLI remap 到 v0.7.0 引擎 API+ISO 8601 时间戳+句子边界保全+端口零拒绝；无新机制原语） |

零移动：claude-code（npm 2.1.296=最新，live CLI 同版零漂移）、codex（rust-v0.162.1=最新 stable，0.163 全 alpha 不取）、claude-mem（v13.35.0）、openspec（1.14.1）、codex-security（npm-v0.2.0）、ECC（v2.2.3）/mattpocock-skills（v1.3.1）/pua（v3.5.1）/gsd-core（v1.16.0）/open-code-review（v1.12.13）/comet（0.4.5）/superpowers（v7.0.0）均无新 stable、gitnexus（v1.6.13 全为 rc 不取）、better-harness（v0.7.0-alpha 不取）、dsh（dsh-v0.2.1-alpha.2 维持）、harnesseval-w（零前移）。

**诱取拦截第八例**：graphify 远端 v1.0.0（0a31c08）仍在，v0.9.86 世系核验通过（`git merge-base --is-ancestor v0.9.85 v0.9.86` 实测成立，v8 线延续）。

## 二、核验锚点

- graphify v0.9.86：v8 世系核验通过（merge-base 祖先确认）；20 提交 log 实读；关键提交 ceff3e2（单行紧凑 JSON）/ddc24c7（exit 3/4）/f905db7（去重按扫描根）message 全读。
- ruflo v3.56.7：tag 排序核验（v3.56.6/v3.56.7 两 patch）；3111685d3（auto-memory 快照 ids）message 全读。
- gstack tip e23f7b80：+39 提交逐条读 head；8fc9f2a5（fail closed）/3b7254a5（consent 执法）message 全读。
- semantica tip d47696a2：+20 提交 head 逐条读（修复批定性）。
- live CLI：claude 2.1.296（`claude --version` 实测=漂移归零）/codex 0.160.0（滞后 0.162.1 记档，升级窗口待用户）。

## 三、吸收（过决策 46 两问：是否改变本技能工作方式/是否为可复用方法论原语）

1. `references/code-graph-tools.md` 新增 R107 段 + 基线 v0.9.85→v0.9.86：
   - **产物形态为评审者设计**：graph.json 改单行紧凑 JSON——每 PR 提交重建图谱的 diff 从数万行降到一行，并在 always-on 文档里明说「大 graph.json diff 是预期的」——**产物格式本身是评审基建**（写安全族的新面：不是原子性而是可评审性）。
   - **弃权语义机读化**：explain/path/query 退出码 3（名字歧义，列候选）/4（无匹配）/0（答案）——「无路径」仍是答案不是错误；脚本与 agent 不解析文本即可辨「拒答 vs 答案」（与 ruflo R105「未知 id exit 1」、codex Guardian JSON transcript 同族：**CLI 退出码是机器接口**）。
   - **去重排序以扫描根为锚**：relative source_file 按 scan root 而非 CWD 解析排序（原从子目录跑会造出 `firmware/firmware/...` 键使边跟不上改名节点）——排序键锚定扫描域不锚运行环境（确定性族）。
   - 其余：Rust grouped use 声明展开成 import 绑定、Scala derives 子句链接 typeclass、Julia operator/functor 方法、codex 语义分块过 B3 合并保全、Ollama 采样种子、null token counts 归零、尊重 git 全局 ignore（core.excludesFile）、uninstall --purge 安全界。
2. `references/subagent-orchestration.md` 新增 R107 注记（ruflo v3.56.7）：
   - **去重前先快照身份**：auto-memory 在去重前先快照 store ids——consolidate() 会给无 id 条目就地赋 id，写时捕获的 ids 与盘上副本失配致合并重加；修复=读 store 时捕获 ids+永不把盘上无 id 条目当别人写的——**身份不明不得被去重逻辑静默吞掉或重复**（与 graphify 同名节点去重防吞同轴，同一周两个记忆/图谱系统各自修复「去重吞实体」）。
   - TUI 观测面（Swarm/Events/Missions 页+页条与按键）+ **AI 页只读钉定**（ask Codex read-only pinned by string）——观测与指挥分离；Codex 版本按串比较不按构建 Rust 版本（钉定语义精确化）。
3. `references/review-methodology.md` 新增 R107 段（gstack e23f7b80）：
   - **解析不了的严重度按最坏处理**：outside-review 门禁读到无法解析的 P0-P3 标签=unparsed_severity=「Verdict: not ready」且 FINDINGS: unspecified 阻塞——fail-closed 族在评审门禁面的实例（不可读≠可通过）。
   - **发布报告门禁要求主体完工**：release report gates require finished repos——报告的前提是被报告的对象已经完成（对「先出报告后干活」的反向门禁）。
   - **consent 执法进发送件**：codex_reviews 同意位在四个发送二进制里执法（not_run/consent_missing exit 3）——外发评审必须携带同意证据（与 R106 gstack outside-voice 线延续）。
   - **压缩副本归并**：Claude Code 2.1.293 压缩后的消息副本（除 uuid/parentUuid/usage 全等）被 owned journal reader 折叠——门禁不再被压缩副本误伤（「压缩不改语义」在消费侧的对策）。
   - stamp-at-merge 自举发布（gstack ships itself under stamp-at-merge）+ Windows LF 嵌套脚本/Git Bash hook 误报恢复批记档。
4. semantica 修复批（薄吸收，记 baseline 行不立档）：temporal 子命令 remap 到 v0.7.0 引擎 API（CLI 面与引擎面版本对齐）、时间戳 ISO 8601、句子边界内容保全、端口零拒绝、备份无 store 路径时 fail——修复与对齐批，无新机制原语。

## 四、同构观察（跨运行时主题）

- **「退出码/输出形态是机器接口」扩散**：graphify exit 3/4 + ruflo exit 1（R105）+ codex Guardian JSON transcript（R106）——agent 时代的 CLI 契约面正在从文本升级为可机读结构，本技能 exec 判据族同向。
- **身份保全跨域成对出现**：graphify 去重按扫描根锚定 + ruflo 去重前快照 ids——「去重不得吞实体」同一周在图谱与记忆两个域各自修复；与本技能「同名 ≠ 同物」纪律同轴。
- **门禁三原则在 gstack 收敛**：不可读=最坏处理（fail-closed）/主体完工才许出报告（报告门禁前提）/外发带同意证据（consent 执法）——与本仓 precheck/门禁族三方会师。

## 五、验证

- 门禁：self-check.sh / tests/run-sweep.sh / tests/test-r68-jargon-free.sh 见发版记录（v2.72.0）。
- 回归：典型前后端项目验证见 CHANGELOG。
