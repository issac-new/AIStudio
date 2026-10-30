# HelixHarness 吸收与 AIStudio 强制面自证缺口修复

日期：2026-10-30
状态：implemented
来源：
- 微信文章《滴滴正式开源AI Coding工程化框架HelixHarness，面向团队规模化研发场景》（TesterHome 转载，2026-10-30）
- GitHub `didi/helixharness`（Apache-2.0，源码版本 1.0.0；插件 315 文件 + 平台 226 文件）
- 滴滴技术号原文《滴滴开源 HelixHarness：让团队 AI Coding 稳定交付》（2026-10-29，5065 字）

## 变更

### 调研结论（决定吸收面的依据）

源码级对照后，AIStudio 在六个维度上整体强于 HelixHarness：56 道门禁、26 步六闸推演、真实 A/B 与改进台均有脚本实现；对方 Hooks 层只有两条 warning-only 脚本，阶段门禁靠命令正文自律（`workflow.py` 校验器须命令主动调用，hooks 不拦跳步）。因此**不照搬其九命令、四层目录与 Host Kit 适配**，只做两类改动：补 AIStudio 自身"宣称与落地不符"的三处缺口；吸收其四项 AIStudio 没有的机制。

### 一、可复现与强制面（P0）

1. **L2 提交强拦在 fresh clone 可复现**
   - 现状：`.claude/skills/aistudio-dev/` 0 文件入库（`.gitignore:33`），钩子垫片三处回退皆无时打印"L2 降级跳过"放行（`.swarm-yuan/hooks/pre-commit:8-15`）。
   - 变更：`skills/swarm-yuan/scripts/generate-skill.sh` 装配段增加渲染 `spec-first-lib.sh`、`spec-first-pre-commit.sh` 到 `.swarm-yuan/hooks/`（垫片第三级回退预留路径），产物入库；新增 `npm run skill:build` 入口。
   - 守门：新增 `custom/__tests__/l2-kit-parity.test.ts`，断言"入库副本 = 生成器渲染结果"，防两版漂移；单一事实源仍是生成器 assets。

2. **qgate 接入提交链**
   - 现状：48 道门的 `pre_commit` 触发只是 YAML 声明，`.swarm-yuan/hooks/pre-commit` 全文零 qgate 调用。
   - 变更：`.swarm-yuan/hooks/pre-push`（原为 Git LFS 垫片）追加 qgate `run --trigger pre_push`；默认 `QGATE_PREPUSH_ENFORCE=0` 只打印风险，置 1 拦截。`.qgate/qgate.yaml` 补齐 `pre_push` 触发声明。
   - 边界：**不加根级 CI**——`.github/workflows/qgate.yml:4` 已明确本仓全量测试依赖本地注入态树、CI 不可复现，该约束保留。

3. **spec 四段机检 + 存量棘轮**
   - 现状：四段中只有「决策记录」与「设计文档影响」有机检（`spec-first-lib.sh:127-138`、`:319-366`），「变更」「验证」无判据；406 份 spec 四段齐全 60 份。
   - 变更：`spec-first-lib.sh` 新增 `spf_sections_check`（四段标题存在、去占位、变更/验证正文至少一行非空）；L2 接在 `spec-first-pre-commit.sh` 放行前，L3 接在 `gates-warn.sh` 的 `check_spec_first` 内。
   - 棘轮：`.swarm-yuan/spec-sections-baseline.txt` 收录当前未达标存量；只对变更集内 spec 强制，基线只许减，配测试断言。

### 二、吸收机制（P1）

4. **spec 内容收据漂移检测**（吸收 `workflow.py:170-200` 的 spec_receipt）
   - `spec-first-lib.sh` 新增 `spf_spec_receipt_hash`：frontmatter 去 `status` 后与正文按规范序拼接，`git hash-object --stdin` 取 sha1（与 `custom/server/eval/fingerprint.ts:22-25` 同算法）。
   - 账本 `.swarm-yuan/spec-receipts.jsonl`（入库）；spec 在本次变更集内视为授权重绑，不在变更集但哈希不符即 drift。
   - `SPEC_RECEIPT_ENFORCE=warn|block`，首轮 warn。

5. **四层上下文读取计量**（吸收 `telemetry_collector.py:61` 的 `context_reads`）
   - `custom/qgate/plugin/hooks/hooks.json` 增加 PostToolUse `Read` matcher → 新脚本 `post-tool-read.mjs`：路径归一后按四层分类，追加 `.qgate/reads.jsonl`。
   - 分层单一事实源 `.qgate/context-layers.json`（knowledge/harness/specs/hooks 四层前缀表）。
   - `custom/server/obssignals/context-reads.ts` 纯函数（JSONL → 四层分桶），接入现有 `/api/harness/obs-signals` 端点。

### 三、评测校准合同（P2，吸收其 bench 与 case 合同）

6. **命令式验收器**：`custom/server/eval/outcome.ts` 注册表新增 `command` 验收器（argv + cwd + 期望退出码 + 超时），cwd 必须落在 `allowedRoots` 内；默认禁用，`EVAL_ALLOW_COMMANDS=1` 才启用，禁用时返回失败而非伪造通过。
7. **F2P/P2P 集校准**：新模块 `custom/server/eval/set-calibration.ts`，用"基线证据必失败、解法证据必通过"两条样本验证 rubric 的区分力；未校准且集要求校准时拒绝正式 run。
8. **隐藏断言跑后注入**：`RubricAssertion.hidden`，集读取与导出过滤隐藏断言，判分包含。
9. **澄清事实冻结**：`EvalSet.clarifications` 随 run 快照冻结，判分读快照不读最新集。

### 四、文档

- `docs/upstream-analysis/component-ledger.md` 登记 HelixHarness（与 Harness²/RRSI/HarnessPro 并列）。
- 整合正本与数字总账同步本批能力与数字。

## 决策记录

1. **只吸收机制、不吸收框架形态**：HelixHarness 的九命令与四层目录在 AIStudio 已有更强等价物（九节点工作流、26 步六闸、`docs/superpowers/specs` + `.swarm-yuan` 知识层）。照搬会制造第二套并行工作流，违反单一事实源。判定依据是其源码：阶段门禁非运行时强制，Hooks 层为 warning-only，Knowledge 加载仅为协议约定。
2. **L2 副本入库而非 fail-closed**：两案对比后选"入库最小副本 + 一致性守门"。理由：fail-closed 会让新克隆无法提交、抬高协作门槛；入库副本配合字节级守门既保证可复现又不产生双事实源（生成器仍是唯一来源）。放弃"保持本地态只写文档"案，因为它把已宣称的四层强制面留成空转。
3. **qgate 走 pre-push 而非根级 CI**：仓内既有决策是 CI 不复现注入态全量测试（`qgate.yml:4`）。pre-push 是本地可执行的最后一道关口，且不拖慢提交。默认只告警、显式置 1 才拦截，避免一次性把 48 道门变成阻塞面。
4. **spec 四段机检走棘轮**：存量 346 份不达标，直接全量强制会制造大面积红灯并诱发绕过。只对变更集强制 + 基线只减，与既有 evidence 棘轮、typecheck 棘轮同构。
5. **收据首轮 warn**：漂移检测是新增能力，先观测假阳性（如编辑器换行、编码差异）再收紧；`SPEC_RECEIPT_ENFORCE` 留 block 档。
6. **回放模型下 F2P/P2P 是"证据级校准"**：AIStudio eval 主形态是回放判分（`runner.ts:1-10`），不执行测试。因此校准只能证明"该 rubric 能区分给定的失败证据与通过证据"，不等于真实执行测试。此边界写进类型注释与文档，禁止对外声称等价 SWE-bench。
7. **命令执行默认关闭**：`command` 验收器引入外部进程执行，属安全边界；默认关闭 + 允许根目录守卫 + 超时上限，失败一律 fail-closed 返回未通过，不伪造 ok。
8. **不做 `git hash-object` 之外的自造哈希**：复用 git 内建与既有 fingerprint 算法，避免脚本跨平台差异（`shasum` 在发行版间行为不一致）。

## 验证

1. 目标单测：`npx vitest run custom/__tests__/l2-kit-parity.test.ts custom/server/obssignals/__tests__/context-reads.test.ts custom/server/eval/__tests__/set-calibration.test.ts custom/server/eval/__tests__/outcome-command.test.ts`
2. L2 副本实跑：fresh clone 到临时目录，构造无 spec 提交，断言被拦而非降级放行。
3. 收据三例：改正文→drift；只改 status/空白→不漂移；spec 在变更集→重绑。
4. 四层计量：真实读取若干 knowledge/specs 文件后检查 `.qgate/reads.jsonl` 与端点分桶。
5. 四段机检：构造缺「验证」段的 spec 提交，断言 L2 拦截；基线文件缩减测试。
6. 合并前全量：`npm test`、`npm run typecheck:harness`、`npm run test:eval`。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md`：补"强制面可复现与 spec 收据"一节，修订能力条目。
- `docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md`：更新 spec 四段覆盖数字、门禁触发面、评测校准能力条目。
