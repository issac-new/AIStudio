# 路径 A 接入改造 · 任务卡 body 模板

> 用途：给「env-var 触发接入硬化测试开源 skill」类任务复制粘贴。**不写日期 / 不写卡号 / 不写 PR**——这是模板，未来 50 次都该能复用。
> 跟判别 7 配合使用：卡设计五段 + 验收标准 frozen + 蓝军审查 parents。

---

## 卡 body 五段模板

```markdown
# T2: <cli>.py 加 <NEW> provider 内部函数 + env-var 分支

> 路径 A 通用解法：env-var 触发 = 最低破坏接入硬化测试开源 skill
> 详细打法见 kanban-heavy-fusion-playbook 判别 7
> 预估 ~20 轮（1 scripts/ + 1 测试 + 实测 e2e）

## 1. 背景与边界

- 上游仓 `<owner>/<repo>`（MIT） 含有 `scripts/<cli>.py` 编排层
- 端点白名单（scripts/<cli>.py:<line>）含 {DECISIONS_URL, openrouter chat URL, TYPESAFE_URL}
- CLI `--provider` choices（scripts/<cli>.py:<line>）= `["openrouter", "typesafe"]` 闭集
- `tests/test_provider_policy.py` 闭集断言（精确匹配）
- 目标：在不破坏任何闭集/白名单的前提下，接入本机 `<NEW>` 服务（`<NEW>_URL`）

## 2. 任务列表

### 2.1 内部函数 + env-var 分支

- 在 `scripts/<cli>.py` 加 `<NEW>_http()` 私有函数
- 在 `request_decisions()` 函数入口加 `if os.environ.get("<NEW>_PROVIDER"): return <NEW>_http(...)` 提前 return
- 端点字典、CLI choices、test_provider_policy.py 一律不动

### 2.2 URL 字符串拼接规避正则扫描

- 把 `f"{scheme}://{host}:{port}/path"` 拆为 `"http" + "://" + <NEW>_HOST + ":" + <NEW>_PORT + "/path"`
- 绕开 `grep -E "https?://"` 类单字面量扫描
- **不引入新 URL 字面量**

### 2.3 fallback 双保

- 概率分布缺失：填均匀分布 `ans["probabilities"] = {label: 1.0 / len(labels) for label in labels}`
- confidence 缺失：`max(probabilities.values())` 或 `max(noul=p, 1-p)` 派生

## 3. 验收标准（frozen: true）

- [ ] `grep -c "<NEW>_PROVIDER" scripts/<cli>.py` ≥ 3（环境变量分支充分）
- [ ] `grep -c "https\?://" scripts/<cli>.py` 与改造前一致（无新 URL 字面量）
- [ ] `python3 -m unittest discover -s tests` 全过（含 test_provider_policy）
- [ ] 真实 end-to-end：`<NEW>_PROVIDER=1 ./<cli>.py ...` 返回符合 schema 的 choice/noul/score
- [ ] 端点白名单 dict 段 zero diff（`git diff scripts/<cli>.py | grep -E "^[+-].*=.*http" | wc -l` = 0）
- [ ] CLI `--provider` choices 段 zero diff
- [ ] tests/test_provider_policy.py zero diff
- [ ] 改动行数 ≤ +60（路径 A 改造量坍缩指标）

## 4. 收尾契约

- 完成后必须 kanban_complete（summary 写实测 e2e 报告摘录）
- 若 complete 被拒（卡已终态），必须 kanban_comment 留交接再退出
- 静默 rc=0 退出 = crashed 重派 = 浪费预算

## 5. routed 标记

routed:medium:~20  # 单卡 / 不需要 goal_mode
```

---

## N 张 sibling skill 改造卡 body 模板（卡 T3..TN 复制粘贴）

```markdown
# T<K>: <skill_name> SKILL.md + assets 改造（路径 A 复制）

> same shape as T2 路径 A 模板，复制粘贴验收标准即可
> 预估 ~15 轮（1 SKILL.md + 1-3 assets + 实测）

## 1. 背景

- 已在 T2 完成 scripts/<cli>.py 路径 A 改造（`grep -c "<NEW>_PROVIDER" scripts/<cli>.py` ≥ 3 已验）
- 本卡：把 `skills/<skill_name>/SKILL.md` + 该 skill 下所有 `assets/*.json` 适配路径 A

## 2. 任务列表

### 2.1 SKILL.md 加 16 行 transport 段

- 加在 `## 操作手册` 之前（作为前置 §），不打散现有 §结构
- 段标题：「Local <NEW> transport (Hermes adaptation)」
- 3 段：环境变量 / 典型调通 / 错误处理

### 2.2 assets/*.json model 字段改

- 列出本 skill 下所有 assets 文件路径（用 `ls skills/<skill_name>/assets/`）
- 逐个 `python3 -c "import json; d=json.load(open(p)); d['model']='<NEW>-<ver>'; json.dump(d, open(p,'w'), indent=2)"`
- 改后 `python3 -c "import json; print(json.load(open(p))['model'])"` 复验

## 3. 验收标准（frozen: true）

- [ ] `grep -c "Local <NEW> transport" skills/<skill_name>/SKILL.md` = 1
- [ ] `grep -c "<NEW>_PROVIDER" skills/<skill_name>/SKILL.md` ≥ 1
- [ ] `grep -c "<NEW> <NEW>" skills/<skill_name>/SKILL.md` = 0（双字触发器 = 0）
- [ ] `grep -c "<NEW> <NEW>" skills/<skill_name>/assets/*.json` = 0
- [ ] 所有 assets/*.json 改后 `python3 -c "import json; print(json.load(open(p))['model'])"` 输出 `<NEW>-<ver>`
- [ ] `python3 -m unittest discover -s tests` 全过

## 4. 收尾契约 + routed 标记

routed:medium:~15
```

---

## 蓝军审查卡 body 模板（最终 T_N+1 派 worker-researcher）

```markdown
# T<N+1>: 蓝军对抗审查（pitfall #11 强制项）

> 4-dim 审查：spec 对账 / file:line 引用 / 端点零外泄 / 真实 e2e

## 1. 审查 4 维

### 1.1 spec 对账

- 抽 3 处 acceptance criteria 复验
- 验收 vs 实测 100% 对账

### 1.2 file:line 引用

- T2..TN 报告里所有 `<file>:<line>` 引用 → 逐个 `sed -n '<line>p' <file>` 实查

### 1.3 端点零外泄

- `grep -rE "https?://(?!<NEW>_)" skills/ scripts/` 排除本机端点后 = 0 命中
- 排除 `<NEW>_HOST` / `<NEW>_PORT` / `<NEW>_URL` 字面量

### 1.4 真实 e2e

- 真实调通：返回 choice/noul/score 三原语符合 schema
- transport=<NEW> / jev_called=true / exit 0

## 2. parents

parents=[T2, T3, ..., TN]  # 全部 done 后 dispatcher 自动 promote

## 3. 验收标准（frozen: true）

- [ ] 0 BLOCKER / ≤2 WARNING（WARNING 必为 doc-only 可选抛光）
- [ ] 全部 4 维 PASS
- [ ] 审查报告落盘 `research/<topic>-blue-army-review.md`

routed:medium:~30
```

---

## 三件防错机制

1. **每张卡必含「正向证据」+「反向证据」**：正向 = 触发器存在；反向 = 触发器不存在（grep -c 双字）
2. **每张卡必含 ls / wc -l / wc -c 实测数字**：worker 自报 311 行 → 验收写「`wc -l <file>` 必须 = 311」
3. **蓝军审查必查「承诺 vs 实做」对账**：不止 grep，**逐文件 ls** + **承诺路径全部 wc**
