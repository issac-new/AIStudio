# HelixHarness 吸收轮挂账清偿：三条既有红根治＋两项活体验证

日期：2026-10-30
状态：implemented
来源：`2026-10-30-helixharness-absorption.md` 交付说明「未做/未验证项」1-3（用户令「完成所有未做的内容」）

## 变更

### 一、三条既有红测试根治（上轮定性、本轮修）

1. **raci-rest-guard：`tests/dm-send-tracked.test.sh` 未入白名单**
   - 定性：该脚本是 DM 送达守门的 **stub 测试**——第 37/43/54 行自建 `mx_join`/`mx_send`/`mx_messages` 假体（函数名与生产原语同名），全文无任何真实 REST URL/curl；命中 `HARNESS_REST_RE` 纯粹因为 stub 定义。
   - 处置：登记 `HARNESS_REST_WHITELIST`（与既有 `tests/multi-owner-stall.test.sh`「断言读回」同款先例——测试文件 stub 原语不属协作消息直连）。**不放宽正则**：正则拦的是「新增真实直连调用」，stub 定义不是直连。
2. **raw-hex 预算：`ide: 32 > 预算 27`**
   - 定性：超标 5 个 hex 全部来自 `38e2481ee`（终端 xterm 黑底可读性修复，用户实报缺陷）＋ `IdeWhiteboardPane` canvas 画笔色——二者都在 JS 运行时取色，**吃不到 CSS `var()`**，与预算表既注明的「terminal ANSI 色板 + ECharts/G6 分类色板（canvas 不吃 var()）」同一性质。
   - 处置：预算 `ide: 27 → 32`，注释注明来源批次与理由（用户实报缺陷修复批 +5）。只降不升棘轮原则不受影响——预算调整有据可查，非无脑放开。
3. **幽灵变量 `--font-sans`**
   - 定性：`IdeUnmaterializedView.vue:279` 的 `var(--font-sans, inherit)` 引用了全仓（含 vendor 注入态 variables.scss）**不存在**的变量——恒走 fallback `inherit`，正是守门注释里说的「变相裸 hex 与第二套状态色温床」。
   - 处置（根治而非登记）：对齐正本 token `--font-ui`（vendor variables.scss:169 定义），改 `var(--font-ui, inherit)`。

### 二、两项活体验证（上轮只做单测，本轮真实运行）

4. **`/api/harness/obs-signals` 的 contextReads 面活体**：起真实 koa 服务（隔离端口＋隔离 EVAL_STORE），向 `.qgate/reads.jsonl` 写入四层样本行，curl 端点断言按层分桶与 byDay/topPaths 正确。
5. **`command` 验收器＋calibrate 端点活体**：同服务进程带 `EVAL_ALLOW_COMMANDS=1`，HTTP 建 S0-regex-only 评测集（零 LLM 调用，判分全本地），跑三条路：
   - outcome `command`（argv=真实命令、期望退出码 0）＋满足 regex 的证据 → run 通过；
   - 期望退出码 3 而命令退 0 → outcome.ok=false；
   - `POST /sets/:id/calibrate` 基线证据（regex 不满足→判负）＋解法证据（满足→判过）→ calibrated:true。
   - 活体结论写回本 spec 验证段（实测命令与输出摘要）。

### 三、上轮第 4 项（生成态技能跨机器态）

不属缺陷：`.claude/skills/aistudio-dev` 本就是本地生成物（AGENTS.md 明示），`skill:build` 包装已给明确结论（worktree/新克隆 rc=2 + 指引），`hooks:install` 幂等且被 ensure-injected 被动补装——fresh clone 首个 npm 入口即具备 L2。本轮在 worktree 内再次实测该链路（IN-FLIGHT 建立→inject→hooks:install→提交被 L2 核验）作为复验证据，无代码改动。

## 决策记录

1. **stub 测试登记白名单而非改正则**：正则的防线语义是「新增真实 REST 直连」；把 stub 函数定义也排除会削弱对「在测试文件里偷偷直连」的拦截。登记条目带注释说明 stub 性质，与 multi-owner-stall 先例一致。
2. **ide 预算上调而非改写代码**：5 个 hex 是终端可读性缺陷（用户实报）的修复产物，canvas/JS 上下文无 token 通道可走；强行搬 token 反而制造回退。预算注释保留批次号可追溯。
3. **font-sans 改引用而非登记豁免**：守门的意图就是消灭幽灵变量；登记豁免等于把缺陷制度化。
4. **活体验证用 S0-regex-only 评测集**：judgeAttempt 对带 s0 的断言走纯本地规则（applyRegexRule），不触发 S1 LLM 判定——活体验证聚焦「HTTP 链路＋验收器执行面」，不花模型调用、不引入外部依赖（成本纪律）。
5. **服务隔离**：PORT=8891（避开 8647 在服实例）＋EVAL_STORE 指向 /tmp 临时库——活体跑完即弃，不污染真实评测账本；.qgate/reads.jsonl 写入行带当天时间戳，事后保留（本就是运行态文件，不入库）。

## 验证

1. `npx vitest run custom/server/matrix/__tests__/raci-rest-guard.test.ts custom/client/__tests__/raw-hex-budget.test.ts` 全绿（3 条既有红转绿）；context-reads 10/10（新增 repoRoot 基准断言）。
2. 活体脚本 `scripts/regression/verify-helix-live.mjs` **连续两轮 10/10 通过、端口零残留**，实测结论：
   - contextReads 端点在真实 koa 服务（服务进程 cwd=vendor/hermes-studio 树）上正确解析**检出根**账本并按层分桶（byLayer={knowledge:1,harness:2,specs:1,hooks:1,other:1}，TopN 首位 AGENTS.md×2）；
   - command 验收器：退出码 0 达成（outcome.ok=true、passed=true）；期望 3 实退 0 → 拒绝（不伪造通过）；
   - calibrate F2P 闭环：基线判负/解法判过 → calibrated:true 且落库（set.calibration 存在）。
3. 全量 `npm test`（合并前）；typecheck:harness rc=0。
4. 本 worktree 全部 commit 已被 L2 pre-commit 实际核验（spec 四段＋DESIGN_SYNC＋收据重绑）。

### 活体过程抓到并根治的三只真虫（比"跑通"更有价值的部分）

1. **eval/controller.ts 重复 import**（上轮遗留）：`fail` 双导入，vitest 与 typecheck:harness 均不覆盖 controller.ts，只有 ts-node 真实启动才编译失败——服务根本起不来。删重复行。佐证「ts-node 全量编译才是真门」既有结论。
2. **contextReads 账本路径用 process.cwd()**（上轮遗留）：服务进程 cwd=vendor 树，端点永远读不到检出根的 reads.jsonl（单测传 file 覆盖掩盖了它）。改走 `repoRoot()`（lib/upstream.ts，K17 同族陷阱），加基准测试。
3. **活体脚本自身生命周期**：serve-server.mjs 退出不连带 ts-node 子进程（close handler 只管自己），首轮异常退出后孤儿服务占着端口，后续请求全打到旧进程、allowedRoots 全不匹配（表象为"非确定失败"）。修法：起前探活防残留＋detached 进程组击杀。

## 设计文档影响

DESIGN_SYNC: none（三项均属测试守门对齐与活体验证收尾；设计正本 §5.7/§5.8 上轮已写，机制面无变化；raw-hex 预算数字的单一事实源在守门文件自身注释内，不入设计总账）
