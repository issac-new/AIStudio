---
name: action-gate-yaml-failclosed-triage
version: 1.0.0
description: "Use when all tools fail with action-gate yaml gate errors."
author: orchestrator
license: internal
metadata:
  hermes:
    tags: [action-gate, pyyaml, venv, fail-closed, incident]
---

# action-gate yaml fail-closed 全局锁死

> 2026-10-14 实证案例。症状、死锁结构、修复路径全部来自该次事故的实测。

## When to Use / 触发条件

- 多个不相关工具调用连续返回同一句 gate error(含 "No module named 'yaml'" 与 fail-closed 字样)
- 子代理的同款工具也被拦,需要判定能否会话内自修

## 症状与判据

所有动作类工具调用(terminal/read_file/search_files/write_file/web_extract/browser_exec/computer_use/skill_view/skill_manage/kanban_*/delegate_task/memory)返回**同一字符串**:

```
action-gate: gate error: No module named 'yaml' — blocked (fail-closed)
```

仅 tool_search / tool_describe / todo_list / clarify 存活(纯 schema 操作,不经 gate 代码路径)。**范围判定方法**: 用存活工具逐一探测,不要再重试被拦路径——同参重试 3 次即停,换证据面。

## 为什么会话内修不了(死锁结构)

- 修复动作(pip install)必须走 terminal,terminal 正是被拦的工具
- 派子代理无效:子代理继承同一 gate(已实证)
- browser 内 subprocess 无效:gate 在工具入口处拦截,先于任何执行

结论: **这是环境级故障,唯一出口是用户在 Hermes 之外的终端操作。** 不要浪费轮次找会话内绕道。

## 根因模式(本机)

- gate 模块 `import yaml` 在加载时失败 → fail-closed 全拒。守门自身失败时拒绝放行是**正确设计,勿放宽**
- 根因是**结构性**的:action-gate 的 `import yaml` 来自一个 patch(本机:hermes-action-gate-p1-2b.patch),**pyyaml 从未被任何 venv 的依赖清单声明**——它在运行时只是「偶然在位」:经 ctranslate2 / huggingface_hub 的传递依赖间接拉来。系统 Python 有 yaml 不代表 venv 有(venv 默认不继承系统 site-packages)
- 本机复发模式: `hermes update` 重建 venv(旧目录改名 `.venv.dangling-<日期>` 遗留)即把 pyyaml 砍掉,patch 引入的 import 立即失败。每次复发跑 `pip install pyyaml` 都当天止血,但**不解决下一次复发**——venv 重建是 hermes update 的标准动作,pyyaml 不进声明就永远在「偶然在位」上

## 处置(用户在外部终端执行)

```bash
# 1. 定位: 哪些解释器缺 yaml
for VP in ~/.hermes/hermes-agent/venv ~/.hermes/hermes-agent/.venv \
          ~/.hermes/installs/*/environments/*/venv; do
  [ -x "$VP/bin/python3" ] && printf '%s -> ' "$VP" \
    && "$VP/bin/python3" -c "import yaml;print('OK',yaml.__version__)" 2>&1 | tail -1
done

# 2. 修复: 给缺的都补上(纯 Python 包,无副作用)
for VP in <上一步缺yaml的>; do
  uv pip install -q --python "$VP/bin/python3" pyyaml && echo "OK: $VP"
done
```

venv 用 `uv pip` 而非自带 pip(uv 建的 venv 默认无 pip)。

3. **重启 Hermes 会话**——gate 失败态在内存里,热重载不保证生效

## 收敛措施(防止下次复发——次日 / 下次 update 仍会撞)

止血只能撑到下次 `hermes update` 重建 venv。结构性收敛三条,本机已裁决:

1. **patch 流程依赖闸门**:patch 引入 `import X` 时 diff 检查 X 是否在该 venv 的依赖清单中声明;缺失则 patch 拒收。**已裁决暂不实施**——措施 2 落地后属等价冗余防线,留待下次 patch 引入新 import 时再评估。
2. **pyproject exact-pin pyyaml**:**已落地,根治**。`hermes-agent/pyproject.toml` 的 dependencies 段声明 `"pyyaml==6.0.3; python_version >= '3.14'"`(格式沿该清单既有 exact-pin 惯例:版本段 + marker 段),附一句注释说明 gate 在每会话热路径上、满足 scope rule。venv 重建按 manifest 装回,传递依赖再裁剪也带不走。改前备份到 `~/.hermes/patches/<日期>-pyyaml-declare/`。**验证三件**:① `uv sync --locked --dry-run` rc=0;② `.venv/bin/python -c "import yaml"` OK;③ `from agent.action_gate import ...` import 复验。
3. **gate shadow 故障域 / 崩溃降级放行**:**永久否决**——把 fail-closed 改成故障放行是安全姿态变更,用户常设裁决是 fail-closed 守门正确、勿放宽。后续会话不得再提议此方向。

处置报告(交付物)里把未落地项写成可裁决的「待用户拍板」选项,**不要只口头列**——口头列了用户下次就忘,得落到持久层+设计文档 gap 节。已裁决项把结论写进设计文档对应 gap 节(措施落地状态+否决理由),让下次会话不必重新调查一遍。

**收敛措施落地时的归责陷阱**:给 pyproject 加声明后按注释要求跑 `hermes pm lock`,它可能因**与本改动无关的既有依赖冲突**失败(如某个 optional extra 引用无法满足的旧版包)。判定归属别猜:stash 掉新声明跑一次 lock + 恢复后跑一次,两次同败 = 既有故障,不属于本卡(记档另行立卡),不要为它阻塞收口;若 `uv.lock` 内该包版本与声明一致(它此前已作为传递依赖进锁),声明即生效,无需重锁成功才算落地。

## 反模式(把 skill 读错后的常见错误)

- **「装好 pyyaml 就算收口了」**:只解了今天的症状,venv 重建必复发。收敛措施任一未落地 = 这次复盘没完成。
- **「那我手动写 .pth 加 yaml 路径」**:这是把偶然在位做成硬编码,任何解释器迁移或包路径变更就再断。三条收敛措施才是结构性答案,.pth 是治标不是治本。

## 验证收口

重启后第一个工具调用不再返回 gate error 即恢复。原任务从中断点继续,零进展的部分如实重做。

## 会话内正确行为清单

1. 第一轮识别全局锁死,不连续重试同一路径
2. 用存活工具确认故障范围,形成证据再上报
3. 明确告知用户任务零进展,禁编造结论
4. 给出上述诊断命令块请用户在外部执行
5. 恢复后: 原任务续做 + 本事故经验沉淀(本次即本 skill 的由来)
