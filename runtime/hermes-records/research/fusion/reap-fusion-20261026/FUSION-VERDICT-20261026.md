# FUSION-VERDICT — REAP 提示词库融合入 hack teams（2026-10-26）

## 源
- 微信文：https://mp.weixin.qq.com/s/iGjicg_WqDaqyN_Srlisfg（转述准确，777 字）
- 正典：https://github.com/JoasASantos/REA-Prompts（REAP, MIT, 2462★, 2026-10-19 建）
- 规模：23 场景节 / 102 提示词 / 26 skill 包；方法论=单特性聚焦+证据强制+三桶分离+静态优先+交付物收尾

## 落地清单（全部验收通过）
| # | 动作 | 落点 | 证据 |
|---|---|---|---|
| 1 | 技能 v1.1.0→v1.2.0 | ~/.hermes/skills/devops/rea-reverse-engineering/SKILL.md | REAP 节 6 处引用；references/reap/ 27 entries (26 包+system_prompt.md, 118KB) |
| 2 | 全 fleet 生效 | 33 profile 路径 | distinct_md5=1（devops 目录软链共享物理副本，广播天然完成） |
| 3 | REA MCP 补装 | hack-exploit + hack-auditor config.yaml | mcp_servers.rea 四键 (command/args/enabled/env)，与 hack-forensics 同款 wrapper+Ghidra env；结构零损伤（lost=none/gained=none） |
| 4 | Resolver 词典 | _shared/scripts/skill_routing.json | 36 条目；"逆向分析这个二进制文件"→primary=rea-reverse-engineering (score 3.0) |
| 5 | hack SOUL x4 | hack-{recon,exploit,auditor,forensics}/SOUL.md | 各含「REA/REAP 逆向能力」节+角色→REAP 包映射+可执行命令 |

## 设计决策
1. **不新建平行技能**：REAP 是 rea-reverse-engineering 的方法论层（同域），按 upstream-agent-skill-fusion Step 0 合并进既有技能，26 包降级为 references/。
2. **hack-recon 不装 REA MCP**：侦察面最小权限原则（recon 任务走 orchestrator/forensics 代跑或 CLI 一次性分析），渐进授权纪律（security-domain-delegation §6）。
3. **exploit/auditor 用 PyYAML 直写**：判例在案（rea-reverse-engineering 技能 §实测纪律 4：运行时有效，rea doctor 报 stale 属 cosmetic）。已验证 22 个 top-level key 零丢失。
4. **角色→包映射**：recon→02/11；exploit→10/19/03；auditor→17/21/14/12/13/08；forensics→15/17/16/22；跨角色→18/08/07/09/04/20/05/06。

## 红线（原样保留）
仅分析自有软件、明确授权软件或合法研究目标。clean-room 克隆只提取行为规格，禁复制代码/资产/品牌/授权机制。逆向任务派工照旧过 security-domain-delegation 授权门。

## 缺口登记（gap）
- REAP 上游高频更新（10-19 建仓、10-25 最后 push）——无自动同步机制；下次需人工重拉。低优先（提示词稳定，非时效内容）。
- hack-recon 的 REA MCP 未装（设计决策非缺口）；如侦察任务实需，走 CLI 子命令。


## 追加裁决（2026-10-26 用户确认）
- **旧方案废弃**：「rm+ln 逐处重建硬链广播」废弃。机制事实（软链共享单物理副本、写一处即广播）已沉淀进 skill `upstream-agent-skill-fusion` Step 4。
- 版本记录：skill `upstream-agent-skill-fusion` 本体未升版（仅 Step 4 增补一段，不改行为面）。
