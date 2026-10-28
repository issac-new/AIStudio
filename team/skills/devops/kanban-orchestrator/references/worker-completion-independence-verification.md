# Kanban Worker Done-Card 独立验收纪律

> 来源：2026-10-15 jev-skill 融合 P1 五卡串行 done 实测 — 用户验收习惯「机械抽查交付物一致性」+「4 选 1 模板」+「文档-实测一致性」的实战沉淀。

## 三件必跑（按顺序）

worker 在 `kanban_complete` 调起后，**orchestrator 不能信自报**——必须按以下三件套机械抽查，缺一不可：

### 1. wc / wc -l 真实行数

```bash
wc -l <file>
ls -la <file>
# 对比 worker 自报「126 行」/「8 文件 475 行」/「5187 bytes」
```

worker 自报行数 / 文件数 / bytes 是 handoff 摘要里的高频数字，**经常乐观**（包含空行/注释/被丢弃的 draft）—— 用 `wc -l` + `ls -la` 双向核对。任何一项 ±5% 以上 = 报告失真。

### 2. 跑 worker 自报的「自检命令」

worker 通常在 handoff 末尾给一句 `python3 .../self-test` 或 `unittest`——**真的跑**：

```bash
JEV_PROVIDER=clef CLEF_BASE_URL=http://127.0.0.1:8000/v1/systemone \
  python3 ~/.hermes/scripts/<gate_wrapper>.py --self-test
```

**自检命令不存在 / 报错** = 文档撒谎（SOUL.md / SKILL.md 提到但 argparse 没实现 / CLI 默认值错 / 路径写错）。**判据**：跑出非零 rc 或 traceback = 文档-代码不同步，必须记到「**文档-实测不一致**」清单。

### 3. 反向 grep 禁出现的字符串

worker 自报「本方案 vs 旧方案」时，常说「本卡**没有** X 字符 / **没有** Y 文件」——**反向 grep 验证**：

```bash
grep -c "X 字面量" <file>      # 必须 = 0
grep -c "Y 函数" <file>        # 必须 = 0
# 正向证据：替代物真的存在
grep -c "X_PROVIDER" <file>    # 必须 ≥1
```

**反向 + 正向 = 三点定位**：反向证明「没做旧的」、正向证明「做了新的」、契约测试证明「旧的还过」。

## 文档-实测不一致 4 类（2026-10-15 实测）

| 类型 | 实测例 | 检测命令 |
|---|---|---|
| **速度数字夸大** | SKILL.md 写「100-300ms」实测 7-77s（差 100-500×）| `tail -50 ~/.hermes/logs/clef-decisions.jsonl \| jq '.latency_ms'` |
| **CLI 参数文档撒谎** | SOUL.md 写 `--self-test` argparse 没实现 | `python3 <script> --help \| grep self-test` |
| **默认值错** | `--diff-path` 默认 `.`（目录）而非文件 | 实际跑一次 + 看 traceback |
| **闭集契约松动** | 测试断言「good fixture → allow」实测 returns needs_review | 跑断言 + 看 `assert ... ==` 行号 |

任何一类发现 = **必须 fix 后才能 done**，不能「文档先发、代码后修」。

## 4 选 1 模板（每次 done 验收后给用户的标准回复格式）

按用户工作纪律「**给方案 → 选一项**」，每张 done 卡验收 + 报告剩余工作后，**必须给 4 选 1 模板**：

```
### 下一步（4 选 1）

| 选项 | 我的动作 | 推荐 |
|---|---|---|
| A. 立即动作 | 派 1 张 fix 卡（worker-coder 修 4 个边界 bug） | ★ |
| B. 不动作 | 等 P1-A done 后统一收口 | |
| C. 统一收口 | 等 P1 全部 done 后建 T10 蓝军终合卡 | |
| D. 你有其他指令 | 听你的 | |
```

**判据**：
- A 通常 = 「立即动作」（派 fix 卡 / 重启 / 跑测试）
- B 通常 = 「不动作」（等 N 全部 done）
- C 通常 = 「统一收口」（建蓝军终合卡）
- D 通常 = 「听你的」（开放选项）

**禁止**给 2 个看起来一样的选项（用户无法判别）/ 超过 4 个选项（决策疲劳）/ 选项里有「再做一次同样的事」（用户已拍板就别再问）/ 开放提问（用户已说「你自己收口」就不需选项）。

## worker-completion-independence-verification 校验清单（蓝军纪律）

- [ ] wc -l / ls -la 真实行数 vs worker 自报
- [ ] 自检命令实际跑通（rc=0 / tests pass）
- [ ] 反向 grep 禁出现的字符串确实没出现
- [ ] 文档数字 vs 实测数据（latency / score / threshold）一致
- [ ] CLI 参数文档 / argparse 一致
- [ ] 闭集契约（test assertion）仍过
- [ ] 产物路径真实存在 + 内容可读

任何一项 fail = 报告「**文档-实测不一致**」给用户 + 4 选 1 模板。

## 反模式（不要做）

- ❌ 信 worker 自报，跑 `wc -l` 都懒得跑
- ❌ 给 6+ 选项（决策疲劳）
- ❌ 给开放提问「你觉得呢」（用户已说「你自己收口」就别问）
- ❌ 文档先发、代码后修（用户验收习惯会抓）
- ❌ 把决策抛回用户（orchestrator 该自己干的活不要甩）
- ❌ 「我可以做但要花 5 分钟」就甩给用户做（用户付的就是这点算力）
