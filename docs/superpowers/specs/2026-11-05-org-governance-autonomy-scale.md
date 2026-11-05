# 2026-11-05 组织治理能力·A 组：自治刻度与责任边界

## 变更

新增服务端域 `custom/server/autonomygov/`（自治治理）：把「一个任务可以被自动化到什么程度」从口头判断变成可配置、可审计、可拦截的刻度。来源是泊珩简澈《组织重写：AI 时代组织设计的第一性问题》中篇原理二与下篇 Step5 界碑，以及《从规划未来到生成未来》Step5 治理三圈与 Step6 指标双轨的制度部分。

### 数据模型

每条自治配置（持久 JSON，`underWebUi('autonomy-gov')`）：

```
AutonomyScaleEntry {
  target: string                 // profile 名 或 workflow:<workflow>:<node>
  al: 0..5                       // 任务级自主等级（Anthropic AL 口径）
  tier: 'human' | 'collab' | 'auto'   // 三圈归属（由 al 派生，不入库，仅回报）
  dod: {
    criteria: string[]           // 什么叫「这个产出可以直接用」（60 分线）
    sample: string               // 一个真实历史样例
    stopCondition: string        // 什么条件下这个任务应当被停掉
  }
  auditSampling: number          // 抽样审计比例 0..1
  humanScan: boolean             // 是否存在人工策略扫描
  reviewedAt: number
  note?: string
}
```

### 三条硬规矩（判定纯函数，`rules.ts`）

| 规矩 | 函数 | 判据 |
|---|---|---|
| AL5 成立条件 | `checkAl5(e)` | `al === 5` 时须 `auditSampling > 0` **且** `humanScan === true`；否则 `blocked`，理由写明缺哪一项 |
| AL4 抽样底线 | `checkAl4(e)` | `al === 4` 时须 `auditSampling > 0`；否则 `warn`（AL4 仍允许，但缺抽样即标记） |
| 60 分线四项 | `checkDod(e)` | `criteria` 非空、`sample` 非空、`stopCondition` 非空；任一为空即 `blocked` |

`stopCondition` 是辨伪底线的直接实现：文章下篇「八种假 AI 化」给出的硬标准是「任何一个 AI 项目，如果拿不出『它在什么条件下应该被停掉』的判据，它就已经是假 AI 化」。本域把它变成入库必填字段，缺失即 `fakeAi: true`。

### 三圈配比（只报告，不设硬阈值）

`distribution.ts` 的 `ratioReport(entries)` 返回：

- `auto` / `collab` / `human` 各占比
- `humanShare === 1` → 自检结论「只有控制，没有治理」（文章下篇 6.2 原文）
- `autoShare === 0` → 自检结论「有治理框架，无授权」
- 与文章经验值 80/15/5 的偏离度（仅展示，不判定）

### 双签判定（不改审批状态机）

`dualsign.ts`：

- `HIGH_RISK_CLASSES`：生产发布、权限提升、数据外发、模型替换、删除类（五类）
- `dualSignSatisfied(change)`：高风险类须两个不同 owner 的签署记录
- 端点 `POST /api/autonomygov/dual-sign/check` 供调用方判定
- 后置校验：读 `approval-log`，高风险变更若单签，落 `dualSignGap` 记录（进 govbus 事件流），页签告警

### 与既有 `autonomyladder` 的关系

不合并。`autonomyladder` 的 3 档（insight/assist/auto）是**流程自治级别**（BCG 口径：洞察/辅助/自动执行），AL0–AL5 是**任务级「AI 干了多少活」**刻度（Anthropic 口径），两者正交。本域提供只读映射 `alFromLadder(level)`：`insight→1`、`assist→2..3`（按 target 细分取 3）、`auto→4`；**不映射到 5**，即流程级「自动执行」不等于任务级「完全脱离人工」。

### 端点（全部挂 `/api/autonomygov`）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/scale` | 全部自治配置 + 每条判定的违规项 |
| PUT | `/scale/:target` | 写入/更新一条（写前跑三条硬规矩，`blocked` 则 409 并返回逐项理由） |
| GET | `/distribution` | 三圈配比 + 两条自检结论 |
| POST | `/dual-sign/check` | 双签判定 |
| GET | `/gaps` | 双签缺口与 AL 违规清单（页签数据源） |

### 强制面

新增 `.qgate/gates/governance.orgscale.yaml`，`domain: L4`，claim `orgscale.autonomy-complete`：`task_close` 触发时，若被改动范围内的 target 存在 `blocked` 条目，则 FAIL；仅 `warn` 则 PASS 带注记。档位 advisory 起步（与仓内既有门一致）。

### 客户端

新增 `custom/client/governance/components/AutonomyScaleSection.vue`，插入 `custom/client/ia2/views/gov/GovPostureView.vue`（姿态页签）。展示：三圈配比条、AL 分布、违规清单、双签缺口。样式走 `var(--token)`，禁裸 hex。

## 决策记录

- **D1（不与 autonomyladder 合并）**：3 档与 AL 六级语义不同（流程自治 vs 任务自主），合并会让「auto 档」被误读成「可到 AL5」。改为只读映射，映射不到 5。代价是两处配置需同时维护，收益是语义不串。
- **D2（AL5 放开为条件式，用户 2026-11-05 裁决）**：初版设计为「AL5 硬禁」，用户裁定改为「AL5 必须配抽样审计＋人工策略扫描才放行」。理由：文章红线原句是「不允许任何任务完全脱离人工策略扫描与抽样审计」，硬禁偏离了括号里的立法本意，也无法覆盖已有 AL5 配置的迁移。落点＝`checkAl5` 条件判定而非枚举排除。
- **D3（双签不侵入审批状态机）**：只在裁决后置读 `approval-log` 并告警，不阻断审批。代价＝不是真拦；收益＝不动 `approval-inbox` 的既有 6 个调用面（该面在 2026-11-04 W2 批刚统一过口径，二次改动代价高）。真拦留待下一轮单独开。
- **D4（三圈配比不设硬阈值）**：文章自述 80/15/5 是「经验比例」而非标准，硬阈值会把经验值伪装成合规线。只给两条退化自检（全人审 / 零自主），这两条在文章里有明确判词。
- **D5（`stopCondition` 必填）**：这是本域最重要的一条。文章给出的辨伪底线是「拿不出停止判据即已是假 AI 化」，把它做成入库必填，等于给全部自治配置装了「可被停掉」的开关。
- **D6（只加一门、advisory 起步）**：不新增门族。三条规矩合并进单 claim，避免门族膨胀；advisory 与 `.qgate/qgate.yaml:2` 声明的档位纪律一致。

## 验证

- `npx vitest run custom/server/autonomygov/__tests__/` —— 三条硬规矩与双签判定逐项断言（AL5 四象限：有审计无扫描 / 有扫描无审计 / 两无 / 两有；AL4 抽样缺失；DoD 三字段各自为空；双签五类高风险 + 双签满足/不满足）。
- 域级集成：PUT 写入被 `blocked` 时返回 409 且不落盘（读回旧值）。
- `npm run typecheck:harness` —— `autonomygov` 入点名清单。
- `npm run inject` 重放补丁 751 后起后端，`GET /api/autonomygov/scale`、`/distribution`、`/gaps` 三端点探活返回 200。
- 浏览器实物走查：姿态页签出现自治刻度区块，三圈配比条与违规清单渲染正确（推断不算，需截图核对）。
- 全量 `npm test` 零新增失败（与环境既有态区分，如实登记）。

## 设计文档影响

**DESIGN_SYNC: touched** —— 触及整合正本 `docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md` §3.6（专题工作台与治理视图）：治理视图清单需追加「自治刻度与三圈读数」一段，说明读模型来源（`autonomygov` 域）、不保存第二份业务真值、以及与 `autonomyladder` 的映射关系而非合并关系。同批修订附录 A 索引（覆盖行计数 + A.1 逐条登记）。
