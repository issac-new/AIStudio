---
name: nightly-loop-step-wiring
description: 夜间 loop 新增/接线管道步骤时用：run_step 守卫、wrapper 契约、CJK patch、双落盘。
version: 1.0.0
metadata:
  hermes:
    tags: [nightly, loop, pipeline, wiring, cron]
---

# 夜间 Loop 新管道接线配方

把一条新管道（抓取→报告→PDF→推送）接成 unified_nightly_loop.sh 的一个步骤。
拓扑权威与频次门规则在 nightly-loop-ops（default profile）；本 skill 是接线操作配方。

## 接线七步（顺序执行）

1. **管道本体落 life-workbench/scripts/**（.py 入口 + 报告生成 + .sh wrapper），
   复用 radar_fetch helper（make_item/keep_top_scored/strip_html/normalize_date）
   与 radar_llm.ask_llm_json，禁自造同名 helper。
2. **wrapper 契约**：首行 `export PATH="/Users/YOURNAME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"`
   （cron 环境 PATH 只有 /usr/bin:/bin，node/pandoc 不可达）；`TEST=1` 跳过投递；
   stdout 只放给用户看的几行摘要（no_agent stdout=直投微信），日志 `>> log 2>&1`。
3. **loop 两处登记，缺一不可**：① 步骤名加进步骤统计 for 循环的 `_s` 列表；
   ② 加 `run_step &lt;名&gt; "$REP/&lt;产物&gt;_$D.pdf" bash ~/.hermes/scripts/&lt;wrapper&gt;.sh || true`
   ——守卫=当日 PDF，天然幂等（同日二跑 SKIP）。步骤名禁空格。
4. **CJK 安全 patch 手法**：cp 原件 `.bak-&lt;日期&gt;-&lt;标签&gt;` → python utf-8 读全文 →
   对 ASCII 锚点 assert count==1 再 replace → 写回 → `bash -n` + `grep -c &lt;步骤名&gt;`
   应=2（for 列表 + run_step 行）。勿用文本 patch 工具直接怼多字节行（字节截断坑）。
5. **graph 节点**：render_loop_graph.py 加节点，判色逻辑与 radar 同构（读当日
   产物/步骤 rc），TEST 干跑无异常。
6. **双落盘**：life-workbench/scripts/ 与 ~/.hermes/scripts/ 两份 md5 一致
   （cron 只认后者，两份并存不同步=跑旧版）。
7. **验证链**：wrapper `TEST=1` exit=0 ＋ PDF≥1 页（`data.count(b'/Type /Page')`
   二进制计数）＋ 同日二跑 SKIP ＋ loop `bash -n` 过。

## 变体：给既有生成器加节（非新增 loop 步骤）

指标/统计类内容挂周报面（如 evals 健康指标进 ops-eval-weekly.sh）时，**不必新增 run_step**——
直接 patch 既有生成器脚本（常在 `profiles/<profile>/scripts/`，loop 经 `$PS` 引用，
单一活跃副本，无双落盘要求），loop 本体与 `_s` 列表零改动：

1. CJK patch 纪律同第 4 步：`.bak-<日期>-<标签>` 备份 → ASCII 锚 `assert count==1` →
   注入 → `bash -n`。
2. 注入形态：统计脚本纯 stdlib 只读，`python3 <脚本> --out <json> | sed 's/^/- /' >> "$REPORT"`；
   数据缺失分支输出「数据缺(原因)」不编 0；锚点后必须原样带回被替换的锚点行。
3. 验证链：`bash -n` + **实跑生成器** + `grep <新节头> <当日产物文件>`——生成器每日
   覆盖写当日报告，天然幂等，无需 PDF 产物守卫；同日手动重跑安全（各节均为当日重算型内容）。
4. 生成器产物的维度说明表（若有）同步加新指标行，防「节在表外」断链。

## Pitfalls

- **冒烟前 `test -x .venv/bin/python`**：workspace 清理/归档会连 .venv 一起删
  （恢复顺序见 nightly-loop-ops 的 workspace 恢复节）；venv 缺席时 wrapper 全批
  rc=126，且 liveness watchdog 仍绿（full done 行照写），只有翻 loop 日志步骤
  矩阵才看得见。
- **上游 schema 类产物（watchlist/config yaml）先 yaml.safe_load 验结构再消费**：
  嵌套层级（如 axes→en/zh 双语词表）与 URL 占位符（如 `{start}/{end}` 日期
  模板需 fetch 时替换当日日期）必须在接线卡 body 里写死，别让实现者猜。
- **系统 python3 无 yaml 属常态**：验证 yaml 产物用 `/opt/homebrew/bin/python3.12`
  或 life-workbench/.venv 解释器，勿据此误判产物损坏。
- **开发期用 stub 上游产物并行开发**（如 3 源小 watchlist），真源接入与全链
  真跑留给合体卡；依赖判型规则见 kanban-orchestrator「拆卡第一刀切在依赖边界」。
- **LLM 研判段三红线**：原料 snippet ≥300 字符入 prompt；prompt 带宁缺毋滥
  硬约束；报告如实标注 N/M 源（1-2 源类别禁写多源交叉验证口吻）。
