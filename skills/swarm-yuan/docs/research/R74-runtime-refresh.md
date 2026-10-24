# R74 运行时刷新档（2026-09-29，用户 /goal 三目标③触发）

## 结论

**1 版本移动 + 2 tip 物化 + 1 npm 通道异常记档 + 15 零移动/记档**（19 行台账全覆盖，口径同 R73：只认稳定 tag，rc/alpha 不物化，tip 漂移单列记档不计为版本移动）。轻量轮：唯一版本移动为 patch 级，按执行纪律①不开调研轮，本轮差异比对与吸收面以本档承载（用户目标显式要求功能差异比对）。

移动与物化三件：**ocr v1.12.10 → v1.12.11**（1 patch，5 提交，Jinja allowlist 模板化）、**gstack main tip +1 → dcaea52**（提交自述 v1.91.7.0：functional QA + 发布前文档门禁）、**dsh master tip +187 → 639ed01539**（rc.2 并入 master 线，Windows ACL 收口 + desktop CLI 安装生命周期束）。

**codex-security npm 通道异常（新发现）**：git tag `npm-v0.1.32` 在仓（R73 物化基线），但 npm registry **从未收到 0.1.32**（`npm view time` 无该条目，latest 停 0.1.31 发布于 2026-09-24T20:14Z）——git tag 先切、npm 发布断流，属发布管道中断类异常；基线维持 0.1.32（git tag 口径），npm 引用若存在须显式钉 0.1.31 或等补发。本仓无 npm 消费点，零暴露。

**codex**：rust-v0.160.0 全 alpha（alpha.6）、0.161.0-alpha.1 已现——stable 断档中；origin/main 领先 rust-v0.159.0 达 **+65**（R73 记 +54，一日 +11 记档不追）。

## 台账（19 行，R74 态）

| 仓库 | R73 基线 | R74 物化 | 移动 | 备注 |
|------|---------|---------|------|------|
| ocr | v1.12.10 | **v1.12.11** | 1 patch（5 提交） | Jinja allowlist 模板化 + 上游规则保留语义 |
| gstack | main tip 65bfb0c | **main tip dcaea52**（自述 v1.91.7.0） | +1 快进 | functional QA + ship 文档门禁 + 发布 fail-closed |
| dsh | main tip 4878cdab | **main tip 639ed01539** | +187 快进 | rc.2 入 master 线；rc 仍不物化 |
| codex | rust-v0.159.0 | rust-v0.159.0 | 0 | 0.160/0.161 全 alpha；main +65 记档 |
| claude-code | 2.1.284(npm) | 2.1.284(npm) | 0 | npm latest 实测同值 |
| codex-security | npm-v0.1.32 | npm-v0.1.32 | 0 | **npm 通道断流异常**：registry 无 0.1.32 条目 |
| ruflo | v3.48.0 | v3.48.0 | 0 | npm latest 同值；tip 前移无 tag |
| graphify | v0.9.71 | v0.9.71 | 0 | v1.0.0 异源本轮 tag 面未再现 |
| claude-mem | v13.28.0 | v13.28.0 | 0 | tip 前移无 tag（13.28.0 为最新 tag） |
| superpowers | v6.4.2 | v6.4.2 | 0 | tip 零漂移 |
| gsd-core | v1.15.0 | v1.15.0 | 0 | tip 前移无 tag |
| better-harness | v0.6.6 | v0.6.6 | 0 | 0.7.0-alpha2 线续，全 alpha |
| openspec | 1.13.2 | 1.13.2 | 0 | npm latest 同值；tip 前移无 tag |
| comet | 0.4.3 | 0.4.3 | 0 | tip 前移无 tag |
| ECC | v2.2.1 | v2.2.1 | 0 | 与 R73 同 |
| semantica | v0.7.0 | v0.7.0 | 0 | tip 前移无 tag |
| gitnexus | v1.6.12 | v1.6.12 | 0 | rc.57 线续；license-risk 不追 |
| pua | v3.5.1 | v3.5.1 | 0 | tip 零漂移 |
| harnesseval-w | ed4ccc6 | ed4ccc6 | 0 | 与 origin/main 齐平 |

## 移动明细

### ocr v1.12.10 → v1.12.11（1 patch，5 提交）

- **Jinja allowlist 模板支持**（#1056）：allowlist 文件类型规则可经 Jinja 模板生成；配套 **「Jinja 冲突消解后保留上游规则」**（模板展开结果与 upstream 规则冲突时上游基线优先——配置合并语义：生成物不得覆写基线，与本仓「投影不得改写真身」I4 不变量同构）。
- IDEA 插件：merge commit 文件对 **first parent** 列举（#1544——diff 基线显式化，与 gsd-core #5008 merge-base 钉定同族）。
- provider catalogs 改从 Go registry 生成（#1212，清单单一事实源）。
- Windows dev 二进制补 .exe 后缀（#1573，平台面）。
- viewer Files Reviewed 分页守卫（隐藏行计数保护，查看器面）。

**吸收**：`references/review-methodology.md` R74 行——allowlist 模板化 + 上游基线保留两条。

### gstack main tip → dcaea52（+1，提交自述 v1.91.7.0，PR #2983 squash）

- **surface-aware 探索式 QA 门禁**：按产品面（surface）分域探索的职能 QA，QA setup 权威在主流程集成后保留（委托权威不被集成吞没）。
- **发布前文档检查门禁**（pre-publication docs checks）+ 原子文档写入归因（evals）。
- **ship 流程路由显式化**：verification/recovery 路由显式、评审事务排序、**发布点 fail-closed**。
- 与本仓交付门禁族同向：QA 证据 + 文档门禁 + 发布 fail-closed 三件套在第三方 harness 再次会师。

### dsh master tip → 639ed01539（+187，rc.2 并入 master 线）

- **rc.2 merge #5479 入 master**——R73 记录的「rc.2 于 release 分支、不在 master 线」已回流；0.2.0 stable 未出，rc 仍不物化。
- **Windows ACL 审查发现收口**（#5432）+ 用户面措辞纠偏（说文件权限不说 ACL）。
- **desktop CLI 安装生命周期束**：bundled CLI 启动与安装守卫（#5393）/ CLI 注册改为安装后菜单动作 / 已装目录生命周期保留——桌面分发与 CLI 命令面的安装治理。
- **user-questions 定时等待与迟到回复**（异步问答语义，与 codex `request_user_input_async` 同族，登记候选）。
- **schedule：到期提醒框定为定时用户消息**（提醒=消息调度的语义归一）。
- web 面性能批（长会话渲染/鲸鱼动画开销）与 model picker 模糊搜索（产品面不吸收）。

## 零移动/记档说明

codex 0.160.0-alpha.6 / 0.161.0-alpha.1 全 alpha 线不物化；claude-code npm latest 2.1.284 与基线同值（stable 通道分裂维持 2.1.277）；ruflo/claude-mem/gsd-core/comet/semantica/openspec 六仓 tip 前移但无新 tag；graphify tag 面本轮干净（v1.0.0 异源未再现诱取）；better-harness 0.7.0-alpha2 线续；gitnexus rc.57 线续（license-risk 维持不追）；superpowers/pua/harnesseval-w 三仓 tip 零漂移。

## 部署副本同步

`~/.cc-switch/skills/swarm-yuan`（`~/.zcode/skills/swarm-yuan` 软链目标）：文本面 rsync 对齐（排除 research/ 与部署本地 .claude）；research 克隆区本轮物化三仓（ocr→v1.12.11 / gstack→dcaea52 / dsh→639ed01539），其余 checkout 维持台账真值。
