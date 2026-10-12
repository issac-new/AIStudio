# token-contract — 四层 token 模型 / 粘贴契约 / 词表防腐 / lint 回灌

> 来源：OpenDesign `packages/contracts/src/design-systems/token-schema.ts` 与 `design-systems/_schema/`（repo 快照 2026-10-10），锚点标注。对应 R2 报告可移植清单 T1-T8。

## §1 四层 token 模型（T1，P0）

两个判定问题导出四层：**谁决定值**（品牌 or schema 作者）× **省略时怎么办**（fail / fallback / alias）（_schema/AGENTS.md:61-167）。

| 层 | 谁决定 | 省略后果 | 例子 |
|---|---|---|---|
| A1-identity | 品牌 | fail（必填无默认） | `--bg` `--fg` `--accent` `--font-display` |
| A1-structure | 品牌 | fail（必填无默认） | 字阶 8 档、`--container-max`、`--section-y-*` |
| A2 | 品牌优先，schema 兜底 | 必填但带 fallback | `--motion-fast:150ms` `--success` `--space-4` |
| B-slot | 品牌（独立值 or alias） | fail（必须出现在 `:root`） | `--fg-2 → var(--fg)` |
| C-extension | 品牌专属 | 白名单外 → fail | per-brand 白名单 + 全局前缀白名单 |

**核心洞察——A2 为什么是「required-with-fallback」而非 optional**（token-schema.ts:39-48 注释原文）：产物由 agent 把一个 `:root` 块**整体粘贴进单一 `<style>`**，不存在运行时全局样式级联；缺 `var()` 引用会静默断链（`var(--motion-fast)` 解析为空 → `transition: ` 规则整条被丢）。fallback 进不了运行时，声明必须随粘贴走。

> 这是 OpenDesign 用 lint 事故反推的关键认知：**为「agent 粘贴」设计契约，不为浏览器 CSS 运行时设计契约。** 任何「agent 生成自包含 artifact」的词表都适用。

## §2 粘贴契约三禁令（T2，P0）

token 块注入 prompt 时必须携带三条禁令（system.ts:1295-1306 原文语义）：

1. **不发明新 token**（Do not invent new tokens）
2. **不重定义这些值**（Do not redefine these values）
3. **不在 `:root` 块外写裸 hex**（Do not write raw hex outside this :root block）

配套定性句：「上面的 DESIGN.md 是散文；这是约束性契约」（The DESIGN.md above is prose; this is the binding contract）。

## §3 schema-as-TS + 双镜像 parity（T3，P1）

- 契约用 TS 常量数组（`TOKEN_SCHEMA`），不用 JSON Schema——daemon 与 guard 共享同一运行时对象，零解析成本（token-schema.ts:101-198）。
- 人类可读镜像（defaults.css）并存，理由是「评审者扫真 CSS 比读 TS 数组快」（_schema/AGENTS.md:17-19）；镜像与契约的字节级 parity 由 guard 强制（check-tokens-fixture-sync.ts:415-483）——**镜像防漂移靠 guard 不靠自觉**。
- OD 全量实证：152/152 包声明全部 56 schema token，未注册扩展 0（R2 报告 ②c 独立脚本全量统计）。约束不是文档，是 CI guard。

## §4 派生文件 = 缓存非第二真源（T6，P1）

所有派生物（components.manifest.json / design-tokens.json / tailwind-v4.css）声明为缓存；guard 用再生成结果与入库版本 `isDeepStrictEqual` 比对，不新鲜即 fail。**双真源是契约系统头号腐烂源**；「缓存必须可重建且入库即校验」可直接搬。

## §5 词表防腐：C 层白名单 + 晋升规则（T4，P1）

- C 层扩展必须进 per-brand 白名单或全局前缀白名单，否则 unknown-token guard fail（token-schema.ts:211-287）。
- 晋升路径（_schema/AGENTS.md:131-167）：
  - C→B-slot：≥2 品牌同名 + 有可 alias 的 sibling
  - C→A2：≥2 品牌 + 有跨品牌合理默认
  - B-slot→A2：≥2 品牌开始独立绑定
  - 降级不支持；废弃走 `@deprecated` 一个 release 后统一删
- **何时不加 token** 反面清单（:169-184）：组件内部值、一次性布局值、投机值、可内联表达的派生值不进 schema——「每个新条目都强迫所有品牌声明或 alias 这个名字」，增长有成本。

## §6 lint 回灌循环（T7，P2）

产物校验结果以结构化块回灌给 agent 下一轮自修：P0/P1/P2 计数 + 逐条 fix + 「重发修正版，不要另写解释」（lint-artifact.ts:519-536 `renderFindingsForAgent` → `<artifact-lint>` 块）。

**诚实边界**（R2 报告 ④Q3）：OD 产物侧是启发式 lint 软门（raw-hex 阈值 12 / accent-overuse 阈值 6，注释自认阈值是为放行设备 chrome 调的），入库侧才是 schema 级硬门；闭环靠回灌-重发循环而非门禁。

**Hermes 落法**：验收反馈格式可抄（计数+逐条 fix+重发指令），阈值启发式按需定，规则表不搬（与 R2 N4 一致——OD 的 lint 规则表与 craft 文档双真源需手工同步，本身就是异味）。

## §7 token-map 确定性 crosswalk（T8，P2）

风格迁移/对照场景：映射三级匹配（精确值→规范化 hex→同名模糊），**永不发明目标 token，unmatched 落审计清单**——「conservative by design, false negatives preferable」（plugins/atoms/token-map.ts:29-31）。与 §6 互补的价值观样本：迁移工具宁可漏配不可错配。
