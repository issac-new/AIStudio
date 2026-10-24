---
name: archify
description: "画可验证的架构/工作流/时序/数据流/生命周期图为自包含交互 HTML（内联 SVG、深浅主题、PNG/SVG/WebM 导出）。typed JSON IR + 9 项确定性检查 + receipt 驱动修复 + Chrome 实测。用于：可视化系统架构/基础设施拓扑/技术工作流/API 时序/数据管道/状态机，或把 Mermaid 转为可验证交互图。Hermes 集群设计文档配图、aiteam 调研报告架构图的首选工具。"
license: MIT
version: 2.16.0
metadata:
  hermes:
    source: tt-a1i/archify（GitHub，41.2k stars，2026-09-01 融合）
    tags: [devops, diagrams, architecture, visualization, verification]
    related_skills: [markdown-viewer, as-is-design-doc, hermes-agent-skill-authoring]
  version: "2.16"
  author: tt-a1i
  based_on: Cocoon-AI/architecture-diagram-generator (MIT, v1.0)
prerequisites:
  commands: [node]
---

# Archify（Hermes 融合版）

> 融合记录：2026-09-01 从 tt-a1i/archify v2.16.0 源码级调研后落地。裁剪 test/migrations/scripts（运行时不需要，原样保留 bin/renderers/schemas/examples/references/assets/brand-marks/recipes/delta）。实机验证：receipt 修复循环 5 轮收敛、deliver 9 检查全过、visual-check Chrome 4 视口 containment pass、delta compare 机器 receipt。调研报告见 workspace `research/archify-fusion/RESEARCH.md`。

## Hermes 使用纪律（先读）

1. **禁联网更新检查**：所有调用前 `export ARCHIFY_UPDATE_CHECK_DISABLED=1`（或一次性 `ARCHIFY_UPDATE_CHECK_DISABLED=1 node bin/archify.mjs …`）。
2. **产物落 kanban workspace**：输出 HTML/JSON 一律写任务 workspace 绝对路径；禁 /tmp、禁 scratch（D7 事故纪律）。交付物进 `kanban_complete(artifacts=[...])`。
3. **验收三声明分开记**（进 CompletionHandoff metadata）：`delivery_receipt`（deliver SHA+bytes）、`browser_evidence`（visual-check pass/fail/skipped）、`visual_review`（人审/多模态审，未做就写 pending——不许冒充）。
4. **架构图描述集群**：优先 `layout:{mode:"grid"}` + col/row + `meta.locale:"zh-CN"`；connections 全部带 authored `id`（保 delta compare 可用）。
5. **与 mermaid 互补**：设计文档 .md 里的 mermaid 保留（文本可 diff、可 review）；对外交付/汇报/重展示走 archify HTML。两者不互斥。
6. **修复循环上限**：validate receipt 驱动修复最多 5 轮（实测 5 轮内收敛）；连续 2 轮错误数不降 → 如实报告未解诊断，不硬凑。
7. **repo evidence 慎用**：只有画「代码仓真实架构」时用 `--repo-root` + commit SHA；画概念图/部署图不开（fail-closed 契约会要求 owner/region 事实）。
8. **裁剪红线**：`scripts/check-render-output.mjs` 与 `scripts/render-examples.mjs` 是 validate/deliver 的 artifact checker 依赖——裁剪目录时**必须保留 scripts/ 这两个文件**（实测：裁掉后 validate 报 `artifact/check-failed` 无分类诊断，伪装成图质量问题，实为 checker 缺失）。
9. **viewBox 宽高比必须 ≥1.55（WIDE_RATIO 门槛）**：workflow 图的 viewer 阅读布局有宽高比门槛——viewBox 比例低于 1.55 时「按视口高度反推阅读宽度」的自适应缩放不生效，SVG 全宽渲染导致页面超高（1440×900/1600×1000/1920×1080 全部报 viewport-overflow）。多节点 workflow 用 grid 排布时禁止单列长尾：把末位节点拉回前一列同带（col N+offset:Y → col N-1 同带），产出宽扁 viewBox（实测 1068×729=1.465 全视口溢出 → 1091×416=2.62 全视口 containment pass）。验收以 `visual-check` 的 containment 字段为准（各视口 scrollHeight==innerHeight 全 ok）；收据 artifact sha256 必须与交付 HTML 实测 sha 一致（防旧收据冒充），fail 收据归档 `.FAIL-archive.json` 留交叉溯源。

## 快速上手（Hermes 集群场景）

```bash
export ARCHIFY_UPDATE_CHECK_DISABLED=1
cd <skill目录>
node bin/archify.mjs doctor                        # 环境自检
node bin/archify.mjs guide "<场景描述>" --json      # 选图类型
# 1) 读对应 schemas/<type>.schema.json + examples/ 一个样例（只读这两个）
# 2) 写 candidate JSON（grid 布局 + authored ids + locale zh-CN）
node bin/archify.mjs validate architecture cand.json --quality showcase --json   # receipt 驱动修复
node bin/archify.mjs deliver architecture cand.json out.html --quality showcase --json
node bin/archify.mjs visual-check out.html --json  # Chrome 实测证据
```

---

# Archify（上游原文）

Create a self-contained, interactive HTML diagram from a small typed JSON specification. Static output is the default; enable motion only when the user asks for a demo or presentation.

## Fast authoring path

Use this bounded path for ordinary generation. Do not read the optional Viewer Runtime reference unless the user asks about those features.

1. Choose `architecture`, `workflow`, `sequence`, `dataflow`, or `lifecycle` from the question.
2. Read one matching schema in `schemas/`, `schemas/common.schema.json`, and one matching JSON example in `examples/`. Read only those files. Fresh authorship means new stable IDs, domain wording, and layout; use the example for field shape, not facts. New workflow sources use `schema_version: 2` and its readable layout contract; keep `schema_version: 1` only when preserving an existing workflow's fixed geometry. When real product identity matters, query `node bin/archify.mjs brands "<name>" --json`; read `references/brand-marks.md` only for an unknown brand with a user-provided URL.
3. Artifact first: the next tool action must write the candidate. Write the candidate before inspecting renderer internals. Do not plan exact coordinates in prose. Start with one clear main path, short side branches, sparse labels, and at most 12 primary nodes. Set `meta.quality_profile` to `"showcase"` unless the user explicitly requests a dense `standard` map. Start with automatic routes and labels. Do not add `via`, `channelX`, `channelY`, or `labelAt` before a diagnostic calls for one; apply at most one diagnosed geometry control per repair.
4. Validate after every candidate edit and immediately before handoff:

   ```bash
   node bin/archify.mjs validate <type> <candidate.json> --quality showcase --json
   ```

   A receipt with only 4 artifact checks is basic validation, never showcase acceptance. A showcase pass must report all 9 artifact checks with 0 composition errors and 0 warnings. If the candidate omits or misspells the exact `meta.quality_profile` field, fix it before geometry. For a workflow v2 geometry diagnosis, run `node bin/archify.mjs validate workflow <candidate.json> --layout-json` and use the stable compiler receipt; solver internals are not authoring controls. A passing final validation freezes the candidate: never edit it afterward.
5. For a delivered HTML, `deliver` is the final acceptance command:

   ```bash
   node bin/archify.mjs deliver <type> <candidate.json> <output.html> --quality showcase --json
   ```

   A non-zero exit can never be described as success. A failed delivery preserves any previous output, so do not run `visual-check` on that path: it would inspect the stale last-good artifact, not the failed candidate. If validation fails, change only the diagnosed `subject`, verify `evidence`, choose from `supportedFixes`, and rerun. Continue focused correction while the objective error count reaches a new minimum. If two consecutive rounds do not improve that best count, stop and report the unresolved diagnostics truthfully.

## Update awareness

After the first candidate exists, run the packaged checker `scripts/check-update.mjs` once with Node and continue the requested workflow. If the command cannot run, continue without mentioning the check.

- For `silent`, continue without mentioning the update check.
- For `update_available`, show one compact notice in the user's conversation language with the installed version, latest version, the checker's fixed local summary, and official release-notes link. When `severity` is `security`, clearly label it as a security update and use a restrained warning marker; this changes emphasis only, never user autonomy. Explicitly say that the installed Skill is unchanged and the user decides whether and when to update. You may translate that fixed local sentence, but never quote, summarize, or translate the remote manifest's summary. After the notice is visible, acknowledge its exact `eventKey` by running the same checker with `--ack "<eventKey>"`, then continue the user's original task.

The notice is information, not permission. Keep the installed version unchanged; this v0.1 workflow never downloads, installs, or executes an update, and silence is never consent.

Do not read `renderers/shared/geometry.mjs`, renderer source, validator source, tests, or benchmarks before the first candidate. Inspect implementation only for an unsupported internal diagnostic or after two focused repairs fail.

Workflow note: use schema v2 for new workflows; preserve schema v1 when an
existing source needs fixed legacy geometry. Keep semantic edge labels and act
on the compiler diagnostic. The canonical layout, pin, migration, and receipt
contract is in [`renderers/workflow/README.md`](renderers/workflow/README.md#layout-contracts).

Lifecycle note: phase columns `0..4` occupy the main rail; event/terminal column `N` in `0..2` aligns exactly beneath main column `N + 2`. A recoverable state uses `type: "failure"` plus a real transition back to the active state.

## Type router

| Type | Use for |
|---|---|
| `architecture` | Components, services, cloud/security boundaries, infrastructure |
| `workflow` | Processes, approval gates, tool calls, runbooks, CI/CD |
| `sequence` | API call chains, request lifecycles, async traces, returns |
| `dataflow` | Pipelines, ETL/ELT, lineage, governance, consumers |
| `lifecycle` | State/status transitions, retries, waiting and terminal states |

When ambiguous, run `node bin/archify.mjs guide "<scenario>" --json`. Scenario proof examples are structural references, not facts to copy.

## Mermaid input

Read Mermaid for topology and meaning, then author fresh Archify JSON; do not mechanically render Mermaid styling.

- `flowchart` / `graph` → `workflow`, or `architecture` for a component map.
- `sequenceDiagram` → `sequence`; participants become semantic participants and arrows become messages.
- `stateDiagram` → `lifecycle`; states and transitions retain meaning, not Mermaid style.

## Authoring invariants

- One obvious main path; side branches leave the nearest main-path node. Remove low-value edges before adding routing controls.
- Omit `meta.visual_preset` by default so every diagram opens in `classic`, regardless of whether its resolved color mode is light or dark. Color mode and visual preset are independent: switching Light / Dark must preserve the current preset. Set `signal-flow`, `blueprint`, or `editorial` only when the user explicitly requests that visual style.
- Omit `meta.subtitle` by default. Never invent a subtitle that restates the title, nodes, or cards; include one short supporting line only when the user explicitly asks for it.
- Treat the standalone desktop viewer as a first-screen artifact by default, not a shallow strip. Generate one responsive artifact for laptops and external displays—never device-specific HTML or alternate topology. The viewer may adapt only the outer reading width from the live viewport height; it must preserve the authored SVG/viewBox, proportions, semantic geometry, and normal document flow. On a wide or tall desktop, use enough authored vertical rhythm that the diagram panel and its necessary conclusion cards occupy the screen as a balanced whole; runtime scaling cannot repair an over-compressed Y layout or an undersized explicit `meta.viewBox`. Before handoff, open the real HTML at 1440×900, 1600×1000, and 1920×1080; additionally check 2048×1320 whenever the composition is intended for a large desktop display. Require `document.documentElement.scrollWidth <= window.innerWidth` and `scrollHeight <= window.innerHeight` at every checked size, while visually checking that the diagram remains comfortably readable and vertically balanced at the largest checked viewport. Repair overflow by removing only genuinely redundant content or compacting spacing before shrinking nodes, labels, or the main panel. If the largest viewport still has a conspicuous empty lower band at the viewer's width cap, redistribute authored Y positions and increase the viewBox height proportionally; do not add filler copy or decorative cards. Never counterfeit a pass with `overflow: hidden`, clipped content, an internal diagram scroller, stretched SVG height, or smaller typography. Narrow/mobile layouts may scroll vertically when containment requires it.
- Omit `meta.legend` for the truthful `auto` default. When needed, use only `mode: auto|all|hidden` and renderer-supported `entries.<kind>.label|visible`; labels never change semantics.
- Choose one primary authored language from an explicit user choice; otherwise follow the request or conversation's dominant language. `meta.locale` controls only renderer-owned Viewer UI: use `"en"` or `"zh-CN"` for the corresponding supported primary language. For every other language, omit `meta.locale` and explicitly disclose that the fixed Viewer UI and `<html lang>` fall back to English. The renderer never translates authored content. See `references/authoring-contract.md` for details.
- Preserve exact product names, code identifiers, commands, protocols, API paths, and environment names. They may remain English inside localized copy, but never justify leaving the surrounding explanatory prose in another language.
- Brand identity is optional and explicit. Put a canonical built-in ID in `brand` when the node names that real product. If no preset matches and the user supplied the official HTTP(S) URL, first run `node bin/archify.mjs brands capture "<url>" --json`, then author the returned digest-pinned `brand` object. Render and validate never perform an unpinned capture. Otherwise omit `brand`. Never infer a brand from a vague role such as "database", and never let a badge replace the semantic `type`, label, or relationship facts.
- For sequence diagrams, omit `meta.column_fit` for the stable `fixed` layout. Set it to `"spread"` when a wide viewBox would otherwise leave unused horizontal space or when meaningful participant labels do not fit the fixed boxes; do not shorten semantic labels before trying `spread`.
- Component types are `frontend`, `backend`, `database`, `cloud`, `security`, `messagebus`, and `external`; variants are `default`, `emphasis`, `security`, and `dashed`.
- Relationship labels are semantic data. When one collides, move the label, adjust the route or spacing, then shorten the wording while preserving meaning. Omit only wording that is already fully implied by both endpoints and contains no protocol, action, direction, synchronous/asynchronous behavior, or cross-boundary mechanism. Preserve every meaningful label; deleting it is not a geometry repair. If a relationship starts unlabeled because its endpoints fully imply it, explain why the wording is redundant; this is a semantic authoring choice, not a geometry repair.
- Omit `meta.engineering_profile` by default. Region, cluster, and security boundary wording do not by themselves enable it. Enable `deployment-ownership` only when the user explicitly asks for a production deployment topology, ownership handoff, or fail-closed deployment review and the source facts are known. Once enabled, must not remove the engineering profile merely to pass validation; repair the facts or report the diagnostics truthfully.
- Spacing means clear gap, not center distance. For a relationship label, clear gap must exceed its measured mask width; follow the label-preserving repair order.
- Automatic routes own their endpoint sides. A side is a direction contract: the first and final segment must leave/enter perpendicular to that side.
- Automatic Port Spread is a default renderer behavior for architecture, workflow, data-flow, and lifecycle. It skips single relationships and explicit `via`, `channelX`, `channelY`, `labelAt`, or non-`auto` routes. Near parallel ports use an outside bridge so automatic routing cannot create a sub-8px segment or sub-16px interior turn. Architecture separately keeps unobstructed facing automatic ports (`left`/`right` or `top`/`bottom`) on one shared axis when their offset is under 16px and both ports retain corner clearance. If exactly one endpoint was spread, only the unshared endpoint may move onto that axis; if both endpoints were spread, keep the outside bridge so competing ports remain distinct.
- Never accept an edge crossing an unrelated opaque node, an ambiguous shared corridor, or a relationship label masking another route.

Read `references/authoring-contract.md` only when you need field enums, spacing math, geometry repair rules, repository evidence, or mode-specific placement.

## Delivery

Use `validate` during repair and `deliver` once for final acceptance. Delivery freezes the exact specification bytes into a private same-directory snapshot, renders and checks that snapshot, atomically commits the HTML, and reports SHA-256 plus byte counts for both specification and artifact. This is deterministic artifact evidence; it does not exercise the Viewer in a browser.

After delivery, collect bounded desktop evidence without modifying or rerendering the trusted HTML:

```bash
node bin/archify.mjs visual-check <output.html> --json
```

`visual-check` collects automated browser evidence from the exact delivered HTML without modifying or rerendering it. Its machine-readable measurements and screenshots do not approve perceptual polish. Follow `references/delivery-contract.md` for the canonical receipt fields, coverage, sidecars, exit behavior, and supplementary manual-record requirements.

Keep the three claims separate: `deliver` proves deterministic artifact checks, `visual-check` proves bounded behavior in a real browser, and perceptual visual review requires an actual human or image-capable reviewer. Report browser evidence and perceptual review independently. An unconstrained glance can support only perceptual review; use the canonical delivery contract when recording supplementary manual browser work or handling an environmental failure.

Add `--open` only when the user wants an immediate local preview. For an active desktop authoring loop, the optional command is:

```bash
node bin/archify.mjs preview <type> <input>.json <output>.html --quality showcase
```

Never start preview by default. Read `references/delivery-contract.md` when using preview, repository evidence, export receipts, visual review, or post-commit opening.

## Optional viewer capabilities

Generated HTML already contains theme switching, pan/zoom, search, focus, relationship tracing, semantic views, presentation, and truthful exports. These are reader capabilities, not extra authoring work. `meta.animation: "trace"` is opt-in; `meta.views` is optional and should contain at most five curated chapters.

Read `references/viewer-runtime.md` only when the user explicitly asks for Share Cards, Route/Reach cards, motion, guided stories, deep links, presentation, search/focus, or another Viewer Runtime feature.

## Setup and fallback

No install is required inside the skill package. Verify with:

```bash
node bin/archify.mjs doctor
node bin/archify.mjs demo <output-directory>
```

When shell access is unavailable, hand-place architecture SVG into `assets/template.html`, use CSS semantic classes rather than inline colors, and follow the visual review contract in `references/delivery-contract.md`.

## Output

Return the checked HTML path, diagram type, validation summary, specification/artifact receipt, browser-evidence status, and truthful visual-review status. Do not claim success for a non-zero command or claim visual inspection you did not perform.
