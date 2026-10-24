# R97 运行时例行刷新轮（2026-10-08）

> 触发：用户 /goal 三目标（本轮为其中「research 目录运行时更新+差异比较+吸收」目标）。口径同 R89 例行轮：research/ 克隆升级到最新稳定 tag、无 release 通道的快进 main tip、差异过决策 46 两问后吸收、表行回写。

## 一、移动面（9 移动 + semantica 前移，11 行零移动）

| 运行时 | 旧基线 | 新基线 | 跨度 | 实质判定 |
|---|---|---|---|---|
| codex | rust-v0.160.0 | rust-v0.161.0 | 155 提交 | 实质 minor（/mcp login+提权/权限存活/持久层修复族） |
| codex-security | npm-v0.1.32 | npm-v0.2.0 | minor | 实质（威胁模型 artifact 化+暴露凭证+扫描面扩展；npm 通道恢复） |
| claude-code | 2.1.289 | 2.1.292 | 3 版 | 290 实质+291 双回归修+292 安全修复 |
| claude-mem | v13.31.0 | v13.34.2 | 3 版 | 实质（prompt-cache 前缀不变性修复） |
| graphify | v0.9.76 | v0.9.80 | 65 提交 | 实质（克隆同一性确定性+MCP 检索缓存） |
| ruflo | v3.52.0 | v3.54.1 | 2 minor | 中等（BM25 重建口径+sidecar 双副本修复） |
| openspec | v1.14.0 | v1.14.1 | patch | 薄（懒加载+草拟即写） |
| ocr | v1.12.11 | v1.12.12 | patch | 薄（OpenRouter 未列模型 override） |
| gstack | tip 4015c28 | tip db74567 | +15 提交 | 注记级（measurement bar/诚实 eval 失败报告） |
| semantica | main b14a2b8d | main 320761de | +115 提交 | 修复/安全依赖批（记档不开档） |

零移动：dsh（0.2.1-alpha.1 后无新 tag，触发点仍为 0.2.x stable/rc）、comet（0.4.4=最新）、gsd-core（v1.16.0=最新）、ECC（v2.2.3=最新）、superpowers（v6.4.2=最新）、GitNexus（v1.6.12=最新，license-risk 不追）、mattpocock-skills（v1.3.1=最新）、pua（v3.5.1=最新）、better-harness（本地 v0.6.6 已高于 latest release v0.4.1——npm latest dist-tag 与 tag 面非单调，维持）。

## 二、核验锚点

- codex 0.161.0：release 2026-10-07T15:58Z（GitHub releases/latest）；`git log rust-v0.160.0..rust-v0.161.0 --oneline | wc -l` = 155；live CLI 本机 0.160.0（滞后一版记档）。
- codex-security 0.2.0：`npm view time` 实测 2026-10-06T03:20Z（**0.1.32 从未上 registry、0.2.0 已上——R74 登记的发布管道断流终结**）。
- graphify v0.9.80：**世系核验** `git merge-base --is-ancestor v0.9.76 v0.9.80` 通过（v1.0.0 异源诱取防线第六次例行动作，本无诱取）。
- claude-mem v13.34.2：release 2026-10-06T18:17Z，发布说明含验证口径（880/881 测试过、1 例与本次改动无关的既有失败如实披露）。
- ruflo 3.54.1：tag+npm 同步（registry 实测）；发布说明自述「未测 Windows」与未修复项清单——诚实边界样本。

## 三、吸收（过决策 46 两问，五档）

1. `references/codex-methodology.md` 新增 rust-v0.161.0 段：/mcp login 会话内鉴权、提权是加法不是重置（保留拒绝面）、显式授权长于连接生命周期、SQLite 损坏先保全再修复、重试界由对端声明。
2. `references/codex-security-methodology.md` 新增 v0.2.0 行：威胁模型 artifact 化（中间资产落盘可复用+双格式兼容读）、暴露凭证检查（检查动作不放大风险）、模板/非常规扩展名是扫描面系统性盲区、沙箱预检先于付费调用、三条升级注意（Content-Type 强制/诊断不脱敏/effort 任意非空串）。
3. `references/claude-code-capabilities.md` 新增 v2.1.290-292 段 + 版本基线 2.1.289→2.1.292：serverToolUses（服务端代跑进审计面）、tool.check 归属与审批等级、WebFetch 截断显式化、计划任务与压缩/交接解耦、UNC 网络路径同一权限面、Agent effort 参数、$.model.complete 缓存块。
4. `references/memory-persistence.md` 新增 v13.34.2 行：**prompt-cache 前缀不变性**——同代际内已发送消息只读、缩减只在代际边界（与 dsh KV Cache 系统提示面互为镜像）；回归测试形态（深拷贝请求断言逐字节前缀）。
5. `references/code-graph-tools.md` 新增 v0.9.80 段：**图谱产物不得编码构建环境身份**（路径/用户名/绝对路径出 id 与 manifest）+ 派生视图按源图代缓存 + 新鲜度自报（graph_stats 带 commit）。

薄轮（openspec/ocr/ruflo/gstack/semantica）按先例表行回写不开档；openspec 两条纪律（懒加载、spec 草拟即写）与 ocr 单修复已记入 baseline 行。

## 四、同构观察（跨运行时主题）

- **缓存边界从隐式变显式**：claude-code `$.model.complete` cache 块（API 化声明）、claude-mem 前缀不变性修复（历史消息只读）、codex 0.157 技能目录代际缓存拒收迟到读——三运行时同期把「什么可以变、什么不可变」写成一等语义。
- **产物环境无关性**：graphify 克隆同一性（不泄漏检出路径/用户名）与 PYTHONHASHSEED 确定性构成完整口径；对图谱类工具，可复现=算法确定+环境身份不入产物。
- **审批面的完备性**：claude-code tool.check 的 agentId+ceiling（归属+阈值）、UNC 旁路修复（网络路径同权限面）与 codex 提权保留拒绝面（提权是加法）同周落位——权限事件的字段化与通道闭环是当前宿主演进主轴。

## 五、验证

- self-check.sh / run-sweep / test-r68-jargon-free：见本轮发版记录（v2.60.0）。
