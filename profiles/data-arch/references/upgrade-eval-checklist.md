# 湖仓组件升级评估 checklist（升级评估流程）

> **定位**：本文件是升级评估的**流程与节奏**规范——回答「升级评估什么时候启动、几天内出什么结论、结论长什么样、怎么留档」。
> **正本分工（不重复建设）**：单次升级的制品级校验与判据正本在《升级风险清单》四门（`life-workbench/gap_workspaces/gap-20260925-021/upgrade-risk-register.md`，含兼容矩阵 §3 与 `verify-artifact.sh`）；版本组合的单一事实源在 `references/version-lock.md`。本文件只补流程编排层，不复制矩阵、不另设判据。
> **适用范围**：Apache Paimon / Apache Fluss 及其衍生制品（connector、Gateway、多语言 SDK）的版本升级评估。其余组件（Flink/CDC/Dinky/MySQL/Redis 等）沿用 `version-lock.md` 升级流程 7 步，不强制走本评估。
> 生效：2026-10-08（gap-20260929-016，t_62938841）。维护责任见 §7。

## 0. 术语与判定枚举

- **大版本**：主/次版本号变化（如 Paimon 2.0→2.1、Fluss 1.0→1.1），或任一含表格式/元数据格式变更的版本。大版本走本评估全流程。
- **常规 patch**：仅第三位版本号变化且官方 release notes 无格式变更（如 2.0.0→2.0.1）。patch 免评估流程，直接走 version-lock 升级流程（制品校验四门仍必过）。
- **go/no-go 判定枚举**（评估结论必须是且仅是其一）：

| 判定 | 含义 | 后续动作 |
|------|------|---------|
| `ADOPT` | 四门全过且沙盒试跑通过 | 进入 version-lock 升级流程第 3-7 步 |
| `WAIT` | 仅 RC/beta 可用，无 GA | 登记 TRACK 到 rc-watch baseline，GA 公告出现后自动重新触发评估 |
| `HOLD` | GA 可用但存在未解风险（矩阵缺口/回滚不可行/类冲突未解） | VERDICT 列明风险清单与复评条件，挂钩子卡 |
| `REJECT` | 与栈内硬约束冲突且无绕行方案 | version-lock「禁止」节登记禁令 |

## 1. 触发（T0）

三个触发源，任一命中即进入评估流程，T0 = 触发当日：

| 触发源 | 机制 | 首责 |
|--------|------|------|
| RC/GA 动态巡检 | `data-stack/scripts/rc-watch.sh` 每日巡检三信源（downloads.apache.org / GitHub releases / Docker Hub），发现新版本输出 `RC_EVENT` 行 | orchestrator 消费事件：GA→当日建评估卡；RC→当日 baseline 登记 TRACK |
| 安全公告（CVE） | 按 `alert-triage-rules.md` 定级；影响在栈组件的安全补丁版，评估优先级提到最前（先例：ZK CVE-2026-24308，t_a1f8e9ac） | orchestrator |
| 人工/业务驱动 | 需要新能力（新类型/新 API/写回等）时手动建评估卡 | 发起人 |

**误报防线**：夜间雷达文本不是版本事实源——雷达条目可能与真实发布状态不符（实例：2026-09-29 雷达记「Paimon 2.1.0-rc3」，2026-10-08 三信源核伪：downloads/GitHub/Docker Hub 均无此版本，证据见本卡 EVIDENCE-rc-watch.md）。一切版本触发以 rc-watch 三信源扫描为准。

## 2. 评估 SLA（时限，硬性）

| 事项 | 时限 | 产物 |
|------|------|------|
| 大版本 GA 公告 → go/no-go 判定 | **≤7 天** | 评估卡 VERDICT（判定枚举+证据锚点） |
| 正式升级评估全流程（桌面评估+沙盒试跑） | **≤2 人日** | 四门逐项填写 + 试跑记录 |
| RC/GA 事件分诊登记 | 事件当日 | baseline 更新 + TRACK 登记行 |
| 常规 patch | 免评估 | 直接走 version-lock 升级 7 步 |

超时处置：时限将到而评估未完 → 先出「判定+证据锚点」最小结论（判定枚举+已核门项+未核项清单），补齐工作拆后续卡。禁止为赶时限跳过制品校验。

## 3. 评估流程五阶段

| 阶段 | 责任 | 时限 | 输入 → 动作 → 产物 | 验证信号 |
|------|------|------|-------------------|---------|
| 0 分诊 | orchestrator | T0 当日 | RC_EVENT/公告 → 核对 version-lock 现锁定版本、判定大版本/patch → 建评估卡（模板见 §5） | 卡落 data 板，assignee=data-orchestrator |
| 1 桌面评估 | arch 判读，flink 预判 | ≤1 人日 | 官方 release notes/矩阵 → 门1 GA 判据逐条 + 门3 兼容矩阵核对（对照本栈 Flink 1.20.5）+ 门4 风险预判 A-D 项 → 结论候选（含能力差异清单与依赖连带） | 每条判据带官方 URL 锚点 |
| 2 沙盒试跑 | infra | ≤1 人日 | 候选制品 → `verify-artifact.sh` 三路校验（sha512/GPG/digest）+ 沙盒栈部署（禁生产 compose）+ `data-stack/regression/` 回归集读写回环 → 试跑记录 | 回归集零失败；校验输出 Good signature；制品存 sha256 |
| 3 判定评审 | orchestrator 主持 | ≤0.5 人日 | 阶段 1/2 产出 → 对照 §0 判定枚举逐条对照 → VERDICT | 判定枚举其一 + 理由一句话 + 证据锚点齐 |
| 4 留档回填 | orchestrator | 判定当日 | VERDICT → 落 gap workspace `VERDICT.md` + 回填 gap_register → ADOPT 则执行 version-lock 3-7 步并 kanban_comment 上报版本变更 | gap_register status=done；version-lock 与 .env 与实际运行版本三方一致 |

## 4. RC 动态跟踪操作手册

- **脚本**：`/Volumes/YOURVOLUME/lab/data-stack/scripts/rc-watch.sh`；基线 `rc-watch-baseline.json`（同目录，脚本可自举创建）。
- **巡检频率**：每日一次（07:40）。三信源均为公开 API，无 LLM 消耗，时段不限。
- **定时接线（2026-10-09 起，t_109811fc）**：hermes cronjob `no_agent` 模式驱动（选 cronjob 弃系统 crontab：统一 fleet 40+ watchdog 机制、执行史落 executions.db、免 macOS cron 维护债）。
  - **Job `992bf77f5c6a`（rc-watch-daily）** 每日 07:40 跑包装脚本 `~/.hermes/profiles/data-infra/scripts/rc-watch-cron.sh`（rc-watch.sh 本体零改动）→ 日志 `/Volumes/YOURVOLUME/lab/data-stack/logs/rc-watch.log` + 事件面 `rc-watch-last-events.txt` + baseline 推进；deliver=local 只存档不外发；rc-watch.sh 退出码透传（1=基线损坏/2=三信源全挂 → cron `last_status` 可见，fail-closed）。
  - **Job `f698f7b3e61a`（rc-watch-event-router）** 每 2 小时 monitor 门控：monitor 脚本读 `rc-watch-last-events.txt`，无 `RC_EVENT` 行→输出恒空→agent 跳过（零日常 LLM）；出现事件→唤醒 agent 分诊。
  - 日志/产物目录 `/Volumes/YOURVOLUME/lab/data-stack/logs/`（rc-watch.log 封顶 4000 行裁 2000）；cron 输出 `~/.hermes/profiles/data-infra/cron/output/`。
- **事件行格式**（供 cron/编排消费，格式冻结勿改）：
  `RC_EVENT component=<paimon|fluss> version=<x.y.z[-rcN]> kind=<ga|prerelease> sources=<n>`
- **事件分诊（实际机制）**：`kind=prerelease` → baseline 自动登记（rc-watch.sh 内建），不建重型卡；`kind=ga` → **Job `f698f7b3e61a` agent 消费**：读 `version-lock.md` 核对锁定版本，不新于锁定→跳过不建卡（防误建实测通过），更新→按 §5 模板 `kanban_create` 建评估卡（assignee=data-orchestrator，即 §3 阶段 0）。兜底：若 Job2 agent 失败，orchestrator 晨检 grep `kind=ga` `rc-watch-last-events.txt` 可降级消费。同根因多事件（同版本多信源）聚合为一条上报，不逐信源轰炸。
- **信源约定与已知边界**：GitHub 未配 token 时限速 60 次/时（脚本单次 2 请求，容错跳过）；Docker Hub 只取第一页 tag（预发布 tag 出现即被覆盖，GA tag 长尾不漏——正式分发以 downloads.apache.org 目录为准）；单信源失败不阻塞其余信源，全挂才 rc=2。
- **基线维护**：baseline 只增不删（历史版本留存）；误报版本人工核伪后可从 baseline 排除并在本节登记一条排除记录。

## 5. 评估卡与 VERDICT 模板

评估卡 body 模板（kanban_create 用，board=data）：

```markdown
## 升级评估：<组件> <现锁版本> → <候选版本>
触发：<RC_EVENT | GA公告 URL | CVE 编号 | 人工事由>（T0=<日期>）
范围：大版本/patch：<判定>；SLA：<go/no-go ≤7 天 / 2 人日>
必做（对照 upgrade-risk-register.md）：
- [ ] 门1 GA 判据 G1-G5（逐条官方 URL 锚点）
- [ ] 门3 兼容矩阵核对（对照本栈 Flink 1.20.5；结论格式：`兼容矩阵核对：<组件> X.Y 支持 Flink A.B/C.D ✅，本栈匹配`）
- [ ] 门2 制品校验（verify-artifact.sh，沙盒试跑用制品必须过三路校验）
- [ ] 门4 风险预判 A-D + 回滚预案 100% 覆盖
- [ ] 沙盒试跑：data-stack/regression/ 回归集读写回环零失败（禁生产 compose）
边界：禁直接改 .env / version-lock；ADOPT 后才进 version-lock 流程 3-7 步
产出：VERDICT（枚举 ADOPT/WAIT/HOLD/REJECT + 理由一句话 + 证据锚点）
```

VERDICT.md 留档模板（落 gap workspace，先例 `gap-20260924-019/VERDICT.md`）：

```markdown
# VERDICT: <组件> <旧> → <新>（<判定枚举>）
- 判定理由（一句话）：
- 门项核对：门1 [过/缺X] 门2 [过/缺X] 门3 [过/缺X] 门4 [过/缺X]
- 试跑记录：回归集 N 例通过/失败 M；制品 sha256：
- 风险与复评条件（WAIT/HOLD 必填）：
- 证据锚点：官方公告/矩阵 URL、校验输出、卡 id
- 回填：gap_register <id> → resolved；version-lock 变更（ADOPT 时）
```

## 6. 角色分工（RACI）

| 岗位 | 职责 | A/R |
|------|------|-----|
| data-orchestrator | 事件消费与分诊、评估卡建立、判定评审主持、版本变更上报、gap 回填 | A |
| data-arch | 门1 判据判读、门3 矩阵判读、能力差异与建模影响清单 | R |
| data-flink | 作业兼容预判（connector 后缀更换、类冲突清单 §3.3 核对、状态/checkpoint 影响） | R |
| data-infra | verify-artifact.sh 校验执行、沙盒试跑、回滚预案编制与演练 | R |

## 7. 维护与关联

- **维护责任**：orchestrator 维护本文件与 baseline；判据/矩阵变更归 upgrade-risk-register（arch 更新，orchestrator 抽查）；脚本缺陷归 data-infra。
- **更新触发**：判定枚举/SLA 变更、新触发源、脚本信源变更、误报排除 → 更新对应节并 kanban_comment 上报。
- **关联文件**：`version-lock.md`（版本事实源+KEYS 登记）｜`upgrade-risk-register.md`（四门正本+verify-artifact.sh）｜`rc-watch.sh`+`rc-watch-baseline.json`（动态跟踪）｜`data-stack/regression/`（试跑回归集）｜`alert-triage-rules.md`（安全公告定级）。
