# R106 运行时例行刷新轮（2026-10-11）

> 触发：用户 /goal 三目标（「research 目录下运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版」目标）。口径同 R105 例行轮：research/ 克隆升级到最新稳定 tag、差异过决策 46 两问后吸收、表行回写。本轮号位 R106（R105 之后顺延）。

## 一、移动面（6 移动，15 行零移动）

| 运行时 | 旧基线 | 新基线 | 跨度 | 实质判定 |
|---|---|---|---|---|
| claude-code | 2.1.295 | 2.1.296 | 1 版 patch | 中等（安全修复批：BASH_ARGV0 审批收紧+非 UTF-8 拒改；能力面：Read allow_large+工作流子代理模型钉定+529 退避上限可配） |
| codex | rust-v0.161.0 | rust-v0.162.1 | 1 minor（229 提交） | 实质（共享任务钉定+无凭据 rendezvous 诊断+Guardian JSON transcript+部分答案相位+ranked tool discovery） |
| graphify | v0.9.82 | v0.9.85 | 3 patch（50 提交） | 实质（单遍树走查性能族+多语言提取修复族+重建锁竞态+巨型 export default 防崩） |
| ruflo | v3.56.2 | v3.56.5 | 3 patch | 薄（图头嗅探 SQLite 锁有界子进程化+确认路由绑定所见卡片+稳定发布通道修复） |
| comet | 0.4.4 | 0.4.5 | 1 patch | 薄（缺失项目索引清理+易受攻击依赖移除，文档同步为主） |
| superpowers | v6.4.2 | v7.0.0 | 1 major（51 文件 +2219/-399） | 实质（brainstorming 重建+Antigravity Marketplace manifest+Windows hook 修复批+TDD 压力例 eval 回滚） |

零移动：claude-mem（v13.35.0=最新）、openspec（1.14.1=最新）、codex-security（npm-v0.2.0=最新）、ECC（v2.2.3）/mattpocock-skills（v1.3.1）/pua（v3.5.1）/gsd-core（v1.16.0）/open-code-review（v1.12.13）均无新 stable、gitnexus（v1.6.13 全为 rc 不取）、better-harness（v0.7.0-alpha 不取）、dsh（dsh-v0.2.1-alpha.2 维持）、gstack/harnesseval-w/semantica（无 tag 通道，main tip 前移留批量轮）。

**诱取拦截实录（第七例）**：graphify 远端 v1.0.0（0a31c08）仍在，`git merge-base --is-ancestor v0.9.82 v1.0.0` 实测不在 v8 线（与 R81 误取/R89 纠错/R105 第六例同一异源 tag）；v0.9.85 世系核验通过（`merge-base --is-ancestor v0.9.82 v0.9.85` 成立）。

## 二、核验锚点

- claude-code 2.1.296：npm 通道 2.1.296（`npm view @anthropic-ai/claude-code version` 实测）；live CLI 本机 2.1.296（`claude --version` 实测）=漂移归零。
- codex rust-v0.162.1：tag 排序核验（rust-v0.163.0-alpha.* 全为 alpha 不取，0.162.1 为 0.161 后唯一 stable）；229 提交 log 实读。
- graphify v0.9.85：v8 世系核验通过；50 提交（含 0.9.83/0.9.84 两中继 tag）。
- ruflo v3.56.5：CHANGELOG/release commit 逐条核对（3.56.3/3.56.4/3.56.5 三 patch）。
- comet 0.4.5：7 提交（docs 同步为主+索引清理+依赖清理）。
- superpowers v7.0.0：单 release 提交 51 文件 diffstat+commit message 全读（TDD eval 实验数据在 message 内：control 8/10 → treatment 5/10 at n=10）。
- live CLI：codex 0.160.0（滞后 0.162.1 记档，升级窗口待用户）/ claude 2.1.296（归零）。

## 三、吸收（过决策 46 两问：是否改变本技能工作方式/是否为可复用方法论原语）

1. `references/claude-code-capabilities.md` 新增 v2.1.296 段 + 版本基线 2.1.295→2.1.296：
   - **Bash 审批通道再收紧**：`BASH_ARGV0` 变量劫持形态的命令不再被自动批准——审批判定不得被 shell 变量赋值通道绕过（与 2.1.284 命令替换递归 rm 同族：权限通道变更须带回归面）。
   - **非 UTF-8 文件拒改**（Windows-1252/Shift-JIS/GBK）：编辑前编码校验 fail-closed——「读得像文本」≠「可安全改写」，静默转码写回=数据损坏。
   - **Read allow_large**：大文件一次读完的显式逃生门（配 offset 续读族）。
   - **工作流子代理模型钉定**（`CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`）+ **autoCompactWindow frontmatter**——子代理资源治理进配置面。
   - **529 退避上限可配**（`CLAUDE_CODE_OVERLOADED_RETRY_MAX_DELAY_MS`）——过载重试有界化族宿主侧延续。
   - 其余：MCP 工具描述上限 2048→4096 字符、Sonnet 5.5 缓存读定价减半、PowerShell 权限规则 32KB 上限、插件 secrets 名 `constructor`/`prototype` 防原型污染。
2. `references/codex-methodology.md` 新增 R106 段（rust-v0.162.1，229 提交深读）：
   - **共享任务钉定（shared task pinning）**：agent 指挥中心里把任务钉定为共享可见——「谁在做什么」从私有时态升为共享事实面。
   - **无凭据 rendezvous 连接诊断**：连接失败诊断不要求先配好凭据——诊断通道与数据通道分离（排障能力不得以「先登录」为前提）。
   - **Guardian JSON transcript**：审计面从人读文本升为机读结构化 transcript——审计是接口不是文档。
   - **部分答案相位（partial answer phase）**：流式输出显式分段「这是部分答案」——流式语义诚实化（完整/部分/失败三态可辨）。
   - **ranked tool discovery**（JS code mode）：工具发现按相关性排序+**agent spawn 有界诊断**（派生失败给出有界原因而非静默）。
   - 其余：Daybreak 控件 opt-in 门控（新 UI 能力默认关）、daemon 兼容性检查限定显式 CLI 覆写、浏览器扩展请求头入配置要求。
3. `references/code-graph-tools.md` 新增 R106 段（graphify v0.9.83-85，50 提交）：
   - **单遍树走查**（symbol facts 收集每棵 JS/TS 树只走一次）+ **路径记忆键去 os.getcwd()**（绝对输入不再掺本地态）——性能修复同时是确定性修复（与 R97 克隆同一性同轴）。
   - **同名节点 id 去重收缩防吞**：不同文件铸造同一 node id 时保两个节点不合并——「同名 ≠ 同物」判别原语再添实例。
   - **巨型 export default 字面量防崩**：解析在超大字面量上不崩——上界输入不炸是提取器的基本契约。
   - 多语言提取修复族：Rust stub 绑定越过 impl 块、TS5 `export type *` 重导出、Scala given...with 成员限定、Elixir defdelegate、Julia/Fortran where 子句函数与参数化类型、Fortran 具名泛型接口、HTML 内嵌脚本标签越界。
   - **watch 重建锁 unlink-vs-flock 竞态修复**+**非 ASCII 文件名 hook 拾取**+**未锚定 ignore 模式按条目名匹配**——「重建不丢变更」与「文件名不是 ASCII 假设」两族。
   - **AFFECTED_RELATIONS 补 defines**——影响面查询的边类型完备性（缺一种边=影响面漏报）。
4. `references/subagent-orchestration.md` 新增 R106 注记（superpowers v7.0.0）：
   - **压缩纪律须经压力例 eval 验证**：v7.0.0 把 TDD Why-Order-Matters 段压缩成一行表格后，eval 实测压力场景（「先把代码写了，测试后补」）下 test-first 行为从 8/10 退化到 5/10（n=10，Claude/Codex 双臂验证）——发布前把五段驳论折回表格行。方法层：**「等价压缩」可能在恰好需要那段论证的压力场景测量性退化；压缩优化必须带压力例 eval，不能只看正常触发路径**。
   - brainstorming 仪式重建+Antigravity Marketplace manifest（多市集分发面）记档。
5. ruflo v3.56.5 / comet 0.4.5（薄吸收，记 baseline 行不立档）：图头嗅探在**有界子进程**里读（嗅探崩溃不拖垮主进程+SQLite 锁不泄漏）、Console 确认路由绑定用户所见卡片（确认的原子性=所见即所确认）、缺失项目索引清理与易受攻击依赖移除。

## 四、同构观察（跨运行时主题）

- **有界子进程/有界诊断扩散**：codex agent spawn 有界诊断、ruflo 图头嗅探有界子进程、claude-code 529 退避上限可配——「辅助性工作（诊断/嗅探/重试）不得无界占用或拖垮主通道」成为三方共识。
- **编码/通道假设备收紧**：claude-code 非 UTF-8 拒改、graphify 非 ASCII 文件名 hook 修复、ruflo publishConfig.tag 稳定通道——「输入不是我以为的形态」从假设升为显式校验。
- **eval 压力例进入发布门禁**：superpowers 用控制/实验双臂 eval 数据决定一段文档的去留——文档变更也进可测量验证面（与 R81 ruflo 评测宣称清剿同向：宣称须有数据）。

## 五、验证

- 门禁：self-check.sh / tests/run-sweep.sh / tests/test-r68-jargon-free.sh 见发版记录（v2.70.0）。
- 回归：典型前后端项目验证见 CHANGELOG（note-forge 全栈样例）。
