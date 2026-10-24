# AIStudio 单仓「规范与约束」探查报告（2026-10-24 全量重生成轮 · 规范路）

仓库：AIStudio worktree（feat/aistudio-dev-regen @ e5ae1a928；origin=github.com/issac-new/AIStudio）。全部条目从文件实读提取，锚点 file:line。

## 1. AGENTS.md 链条逐条提取

### 1.1 根 AGENTS.md（59 行）

**工作规则 8 条**（AGENTS.md:5-14）：
1. 只改本仓；`vendor/**` 是钉版基线（台账 `vendor/VENDOR.md`），注入后脏态是预期工作态、不入提交（pre-commit 自动撤出）；基线替换只走 `npm run vendor:sync` + `VENDOR_SYNC=1` 显式通道；`vendor/**` 内禁建 `.git`（:7）。
2. 代码改动先写 `docs/superpowers/specs/YYYY-MM-DD-<slug>.md`，至少含「变更 / 决策记录 / 验证」三段；spec 是决策事实源（:8）。
3. 分支 `feat|fix|refactor/<slug>`，从 `origin/main` 起；并行会话用 worktree；清理只走 `git worktree remove/prune`，禁止 `rm -rf`（:9）。
4. 提交前跑目标测试 `npx vitest run <path>`；合并前 `npm test`；新增服务端模块跑 `npm run typecheck:harness`（:10）。
5. 失败不隐瞒（:11）。
6. 安全纪律：审计不落敏感原值；密钥只存 env 名；不削弱既有安全边界（:12）。
7. 注释用中文，标识符用英文；注释只写约束与来源（:13）。
8. 只存源码/脚本/文档/依赖清单；中间产物不入库（:14）。

**三条不变量**（:50-54）：单一事实源 / fail-soft 不造假 / 执行层强制。
**输出格式**（:56-58）：结论先行 → 改动清单（file:line）→ 验证命令与结果 → 未做/未验证项。

### 1.2 custom/server/AGENTS.md（32 行）

- 结构：每域一目录，`*-controller.ts` 挂 REST，纯函数与存储分离，`__tests__/` 同级或域内（:3）。
- 关键约定（:5-11）：路由挂载优先进已挂载 controller（harness-controller 由 patch 543 挂载先例），新建独立路由必须在 `patches/` 加挂载补丁并登记 series；JSON/JSONL 原子写（tmp → rename）、SQLite 用 `node:sqlite`、测试 env 指向 tmpdir；读模型 fail-soft 与执法链 fail-closed 不可混用；工具上下文含 `userId/sessionId/profileId/runId`，审计可落身份标识不可落敏感参数原值；`toolpipeline/tool-hooks.ts` 是工具执行审计唯一出口，新增字段先扩展 `ToolExecAuditEntry`。
- 域索引 9 域（:13-25）：toolcontract / toolpipeline / harness / loop+graph / approvals / eval / govbus / evidence / trust。
- 测试约定（:27-31）：jsdom 只用于组件测试；env 覆盖 `afterEach` 复原；`mkdtempSync` 后清理；断言写真实证据。

### 1.3 custom/client/AGENTS.md（24 行）

- 功能区：`ide/ ia2/ cockpit/ governance/ kanban/ matrix-chat/`（:3）。
- API 统一走 `@/api/client` 的 `request`；历史组件可 `fetch` + `authHeaders()`（JWT 从 `hermes_api_key`）；不直接拼后端 URL（:7）。
- i18n：域级 `i18n.ts` 中英成对；技术证据原样展示（:8）。
- 样式：scoped SCSS + CSS 变量 token（`--border-color` 等），不写裸 hex（:9）。
- 测试锚点：`data-testid` 命名 `<域>-<对象>-<状态>`（:10）。
- 组件测试：`vi.mock` API 模块 + `flushPromises()`；失败态单独断言（:11）。
- 懒加载：大页签异步组件/路由级 code split（:12）。

### 1.4 vendor/VENDOR.md（29 行）

- 基线替换：git 跟踪 pristine，inject 工作树打补丁，基线变更只走 `npm run vendor:sync`（:3）。
- 三树台账（:5-9）：hermes-studio `04e5d9aa7` v0.7.38、hermes-agent `4d04303818` v0.22.4、zcode `3c5b2276`（:11-13 差一提交说明）。
- 升级 4 步（:15-20）：upstream/<tree> pull → `git archive HEAD | tar -x -C vendor/<tree>` 整树替换 → `npm run inject` 重放（冲突在 patches/ 修）→ `VENDOR_SYNC=1` 显式提交。
- 同步纪律（:26-29）：upstream 保持 pristine；禁止在其工作树手改 package.json/lock——新依赖走 patches/（先例 017/080/103/136/137/138/573，锁收口 687）。

## 2. spec-first 门禁细节

### 2.1 .swarm-yuan/hooks/pre-commit（21 行）

```
SF="/Users/cuishi/lab/AIStudio/.claude/skills/ncwk-dev/scripts/spec-first-pre-commit.sh"
if [ -f "$SF" ]; then bash "$SF" "$@" || exit $?
else echo "[pre-commit] spec-first 工作区脚本缺席（全新克隆形态），L2 降级跳过；L1/L3 门禁不变。"; fi
if [ "${VENDOR_SYNC:-0}" != "1" ] && git diff --cached --name-only -- vendor/ 2>/dev/null | grep -q .; then
  git reset -q HEAD -- vendor/; echo "[pre-commit] vendor/** 钉版基线注入态不入提交（已自动撤出）…"
fi
```
两条职责：① 委托仓外 spec-first 脚本（缺席 fail-open 降级）；② vendor/** 挡护 + `VENDOR_SYNC=1` 逃生通道。**⚠ 技能替换时 SF 路径须同步改指 aistudio-dev。**

### 2.2 spec-required 触发路径

- 拦截条件（全部满足才拦）：`SPEC_REQUIRED=1` ∧ staged 触及 `WRITABLE_DIRS` ∧ `SPEC_GLOB` 无已批准 spec（含「## 决策记录」段且非占位）∧ SKILL.md 非 draft。
- **WRITABLE_DIRS（旧 ncwk-dev precheck.conf 实装值）**：custom registries config scripts patches zcode-patches runtime docs 八面触发；simharness/skills/team/assets/vendor 不在列。
- SPEC_GLOB：`docs/superpowers/specs/*.md`。
- R109-D8：特性分支上治理 spec 须出现在变更集（staged ∪ 本分支 diff）；基分支保留存在性检查。
- 拦截落 `.swarm-yuan/gate-deny.jsonl`（tool=git-commit，gates=spec-required）并 exit 1；`--no-verify` 由 L3/L4 兜底。

### 2.3 spec 文件约定（334 个现存 .md 抽样 5 份）

- 位置/命名：`docs/superpowers/specs/YYYY-MM-DD-<slug>.md`。
- 必含 `## 变更`、`## 决策记录`（D1/D2… 编号带理由与备选）、`## 验证`（实测命令与数字，未跑项如实披露）。

### 2.4 台账角色（.swarm-yuan/，有意入库）

- `decisions.jsonl`：决策事实源（ts/phase/type/ai_suggestion/user_action/rationale/ref_trace_hash）。
- `trace.jsonl`：流程节点追踪（node/actor/tool/status/note）。
- `gate-deny.jsonl`：拦截审计。**⚠ 首行现存 merge 冲突标记残留（`<<<<<<< HEAD`），待修。**

## 3. 提交与分支规范（60 条 git log 实证）

- header：中文为主（类型前缀+slug+中文摘要）；scope 常用 `(kanban)`/`(eval)`/`(AGENTS)`/`(deps)`。
- 类型分布（5204 提交权威口径）：feat 1491 / fix 1344 / merge 1225 / docs 670 / chore 98 / test 82 / refactor 49。
- merge 风格：`merge: <分支slug> 并入——<中文摘要>`（非 ff，保留边界）。
- 分支：`feat/<slug>`（feat/integrate-aistudio）、`fix/<slug>`（fix/deps-supply-chain-unify）、`docs/<slug>`（docs/workspace-dirs-map）；worktree 模式 spec 记录验证端口。

## 4. 测试规范

- **vitest 主面**：`npm test` = `vitest run`；根 vitest.config.ts `include: ['custom/**/*.test.ts', 'scripts/**/*.test.ts']`（:70，只跑 overlay 自有测试不混 vendor）；alias 顺序 `@/custom`→`@custom`→`@`（上游根 env `OVERLAY_UPSTREAM_ROOT` ＞ `vendor/` ＞ `../upstream`，:23-35）；setupFiles=custom/client/test/setup.ts；testTimeout 20000；jsdom 按文件头注释指定。custom+scripts 现有 875 个 .test.ts。
- **simharness 独立面**：自带 vitest.config.ts + tests/run-gates.sh（sh 守门并行跑 mux/tests + tests/，vitest 143 测 + 隔离边界三断言）；node_modules 解析序「本仓自持优先＞借道 overlay」（run-gates.sh:2-5）。
- **pytest**：runtime/tests/（gateway/hermes_cli 两族）；运行态前提=拼合树（vendor v0.22.4 基线 + runtime 覆盖层），实例 `python3.14 -m pytest` 22 passed（specs/2026-10-24-kanban-estimate-workload-impl.md:36）；覆盖层经 runtime-manifest.json 同步到 ~/.hermes/hermes-agent。
- **typecheck:harness**：tsc 点名 ~130 个 custom/server 模块 noEmit；新增服务端模块须手动并入。
- **基线数字口径**：无单一常量；权威口径=每轮实测记录（b3756a051「全量 6260 测绿」）；机器防缩水下限 `.qgate/gates/engineering.basic-check.yaml` `minTotal: 100`（junit 重解析）。

## 5. 补丁纪律

- **series 登记格式**：每行一个补丁文件名，`#` 注释行 `# NNN: <一句话>——<细节>`；撞号改号须注释留痕（682/683「原 680 撞号」）。
- **命名**：`NNN-<area>-<desc>.patch`，area ∈ client/server/test/i18n/desktop/cockpit/config/vite/routes/package-json/package-lock。
- **新增补丁流程**：vendor 注入态临时改 → `git diff` 存 patches/NNN → 还原 → series 登记 → `npm run inject` 重放验证；改 B 类 patch 后后端重启前 `npm run clean && npm run inject`；新依赖补丁须同步锁（687 先例）。
- **退役两级**：`patches/_skip-07NN/`（上游升级吸收移存，series 注释留痕）；`.archived-patches/`（整族退役）。zcode-patches 退役件「留档不登记」。现状基线：403 applied / 0 FAILED（396 studio/agent + 7 zcode）。

## 6. qgate 门禁体系

- **custom/qgate/ 独立子项目**（独立 lock/tsconfig/vitest；CI standalone）：src/core（Claim/Evidence/Gate/Risk）+ src/executors（command/persistence/ontology/files/llm 五执行器，llm 永不单独 PASS）+ src/cli.ts（plan/run/status/explain/evidence/risk/waive/exceptions/release-report/validate-config/init）+ plugin/（ZCode 插件六事件钩子）+ __tests__/（52 例）。
- **gate-packs 16 包**：l0/engineering/persistence/ontology/security/architecture/delivery/api-contract/schema/llm/behavior/contract/conventions/grounding/ops + _profiles。domain 分布 L3×14、L2×10、L4×9、L5×6、L0×6、L1×3。
- **_profiles 四档**：vibe-fast / feature-close / high-assurance / release。vibe-fast=tier lite，disable L2-L5 与 L0.intent-drift。
- **.qgate/ 项目覆盖门**：qgate.yaml（profile=vibe-fast）+ gates/engineering.basic-check.yaml（executor npm test junit 重解析 + minTotal:100 + triggers task_close/pre_commit/release + policy failure/inconclusive 均 warn advisory）+ gates/symbol-grounding.yaml（depsFile: vendor/hermes-studio/package.json + aliases + ignoredSpecifiers 豁免清单逐项注释）。
- **CI（.github/workflows/qgate.yml）**：仅 custom/qgate/** 路径触发；ubuntu + node 24；install + tsc + vitest（working-directory custom/qgate）；只跑 qgate 自身（overlay 全量依赖本地注入态，CI 不可复现，qgate.yml:3-4）。

## 7. i18n 与编码规范

- **locale 三方结构**：① 上游正本 vendor/hermes-studio/packages/client/src/i18n/locales/*.ts；② custom 域级词表 custom/client/<域>/i18n*.ts（15+ 文件）；③ 补丁通道（40+ 条 i18n/locale 补丁）。
- **并集/保全机制**：`custom/client/__tests__/i18n-upstream-keys-gate.test.ts`（pristine ⊆ pristine−删除+新增 逐键对账，473 事故后立）；`ia2-i18n-coverage.test.ts`（custom 静态键必须在 zh/en 词表，补键流程=改 upstream locales → 存 patch → inject 重注入，upstream 目录禁止直改落盘）。
- **中文注释/英文标识符实例**：custom/server/toolcontract/contract.ts:1-11（域注释中文+标识符英文）、custom/client/governance/api/harness.ts:1-5（DTO 即契约注释）、vitest.config.ts:1-8。例外：runtime/hermes_cli/kanban_db.py 沿上游英文 docstring。
- **ESLint/Prettier**：custom/ 与根**无自有 lint 配置**（仅 vendor 内上游配置）；根 tsconfig 6 项宽松；风格执法由 vitest 守门测试 + .qgate symbol-grounding 承担。

## 8. 文档结构

- docs/ 顶层散档 `YYYY-MM-DD-<topic>.md` 研究/复盘 40+ + USAGE.md + intro.html + manuals/（两份中文手册）。
- docs/superpowers/：specs/ 334 + plans/ 62 + notes/ + assets/。
- **正本设计文档族**：`2026-10-23-swarmstudio-integrated-design.md`（八章整合正本，USAGE 指认）；`2026-10-23-swarmstudio-design-ledger.md`（设计数字总账）；`2026-10-05-mux-v8-fullflow-plan.md`（推演方案唯一正本）。
- **RELEASE-NOTES.md**：最新轮置顶 `## 版本`，旧轮下移历史段；每条含功能+验证数字+边界披露。
- **evidence/**：文本类留档（二进制禁入是 2026-10-24 立法，现存 PNG 属历史遗留）。

## 附：两个异常态（如实披露）

1. `.swarm-yuan/gate-deny.jsonl` 首行残留 merge 冲突标记（`<<<<<<< HEAD`）。
2. pre-commit 垫片 spec-first 判定脚本与 precheck.conf 在仓外绝对路径（旧 ncwk-dev 技能目录），fresh clone 时 L2 fail-open 降级；技能替换时路径须同步换。
