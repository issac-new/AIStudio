# R14：阿里云 Qoder Better Harness 调研与吸收（2026-08-21）

> 来源：微信文章《代码从失控到可控 | 阿里云Qoder开源Better Harness》（风火轮技术团队/Ricechen，2026-07-29）+ 源码实证 `research/better-harness/`（master 996fd3d，浅克隆）。
> 性质：审计/复盘/趋势层吸收——与 swarm-yuan 的过程强制层（门禁）**互补不竞争**。

## 一、better-harness 核心机制（源码实证）

| 机制 | 内容 | file:line |
|---|---|---|
| **Agent Work Loop 五维** | Task Understanding / Controlled Execution / Change Validation / Reliable Delivery / Learning Capture，15 check id | `models/agent-work-loop.md:83-89` |
| **证据态七态 + 分数上限** | Present≤74 / Wired≤84 / Exercised≤94 / Outcome-supported≤100；Missing/Unobserved/N/A ≤59。"配置的机制不算被使用的机制" | `agent-work-loop.md:110-124` |
| **Task Episode 审计单元** | 一个用户目标 + 一个验收边界（跨会话归并，change set ↔ final validation set 链接才闭合）；非会话/非 run | `agent-work-loop.md:11-22,50-53` |
| **session-limited 降级 + sourceGaps** | 证据缺口显式进报告（eligible/analyzed 计数、缺口码列表），不伪装成结论 | `task-loop-report.mjs:1952-2011` |
| **Finding-bound repair** | finding id + expectedRevision 乐观锁 + owner 路由 + 独立复核 verified/partial/blocked | `finding-bound-fix.md:14-139` |
| **双账本** | Repair Progress（当窗验证）vs Loop Effectiveness（跨窗效果——后期可比窗口证据才允许声明） | `agent-work-loop.md:151-164` |
| **Intervention ledger** | 主指标+guardrail 配对、taskMix 可比性三档、必填 stop/revert、跨 run 恢复走内容校验 | `intervention-ledger.mjs:119-278` |

## 二、吸收三问评审与落地

**裁决**：原则 1-6 落条件（合并 4 单元），原则 7（跨 run 恢复走内容校验）与 last-good 同构印证无需改，原则 8（多源证据调和协议）登记候选（触发条件=出现多源证据冲突场景）。Canvas 可视化/HTML 报告不吸收（swarm-yuan 是 bash+JSONL 账本体系）。

### 落地单元（全部落条件，可执行）

1. **审计单元目标闭环化**：`decisions.jsonl` 增 `goal_id` + `closure` 字段（trace-log.sh --goal/--closure；回放兼容——旧行无字段视 `goal_id=""` `closure="open"`，延续 R12-D 回放不可变原则）。审计单元从"运行/会话"升级为"目标闭环"。
2. **证据态分级**：`gate-report.sh` 增 §4.2 段——Present/Wired/Exercised/Outcome-supported 语义 + 分数上限（≤59/74/84/94/100）+ 门禁数统计。"配置≠使用≠有效"。
3. **双账本**：`gate-trends.sh` 汇总区加——当窗验证（Repair Progress = repair_verified_rate）+ guardrail 配对指标（弱点密度）+ 跨窗效果（Loop Effectiveness）声明为"需 --window 两次执行对比，登记候选"（诚实声明当前账本不输出）。
4. **修复复核位**：`decisions.jsonl` 增 `repair_review` 字段（trace-log.sh --repair-review verified|partial|blocked——bash 层无独立 agent，用 AI 复核留痕代替 better-harness 的独立复核子代理；复核不可用则字段为空 = pending 语义）。

## 三、不吸收清单（显式登记）

- Canvas 可视化 / HTML 报告渲染器（swarm-yuan 报告形态是 gate-report/gate-trends 文本输出，加可视化属加法）
- 五维评估模型的 AI 打分逻辑（需要 LLM 子代理基础设施，bash 层不建；证据态语义已吸收为静态标签）
- 12 宿主适配器（swarm-yuan 的宿主下沉走 render-tools 双宿主渲染，路径不同）
- Task Episode 的机器构建器（episode-contract.mjs 的 30 分钟空隙切分等启发式——bash 层用 goal_id 字段承载同一目标的归并，不建切分器）

## 四、候选登记

| 候选 | 触发条件 |
|------|----------|
| 多源证据调和协议（候选全保留+合并留痕+弃置留 reason） | gate-audit 与 fingerprint 链出现真实冲突场景 |
| --window 两次执行对比（Loop Effectiveness 跨窗判定） | 用户报"修复后不知道下次任务是否真的变好" |
| 独立复核子代理（修复后 verified/partial/blocked 由独立 agent 判） | 宿主 CLI 的子代理机制成熟可复用时 |

## 五、验证

17 测试 + gen-e2e 全 PASS；decisions.jsonl 新字段回放兼容验证（旧行无字段视默认）；gate-report 证据态段冒烟（Exercised=3/Present=0 正确）；gate-trends 双账本冒烟（guardrail 配对输出正确）。
