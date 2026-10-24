---
name: scope-gate
description: "确定性 Scope 门禁 — 基于 Threatswarm scope_check.py 设计，防止安全测试超出授权范围。任何 terminal 命令执行前必须通过 scope 校验。"
version: 1.0.0
author: Hermes Agent (inspired by Threatswarm scope_check.py)
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [security, scope-gate, authorization, pentest-safety, deterministic-gate]
    source: "https://github.com/mukul975/Threatswarm"
    inspired_by: "scope_check.py (226 lines, PreToolUse exit 2 hard-block)"
---

# Scope Gate — 确定性授权范围门禁

> **核心原则**：安全关键约束绝不能只靠 prompt。scope 校验必须是确定性的代码门禁，不是"建议"。

## 设计理念（来自 Threatswarm）

Threatswarm 的 `scope_check.py` 是 226 行 PreToolUse hook：
- 拦截所有 Bash 命令，exit code 2 = 硬阻断
- 60+ 网络工具的 word-boundary 正则匹配（`\bnmap\b` 防误伤 `sync`/`hashcat`）
- IPv4 + hostname 双提取，误报过滤（版本号、Python 方法链、文件扩展名）
- CIDR/单 IP/域名/子域名四种 scope 条目；localhost 恒放行；无 scope.txt = warn 放行

Hermes 无 hook 生命周期，等价实现：
1. **scope.txt 契约**：任务开始前必须创建，声明授权范围
2. **SOUL 强制规则**：profile SOUL.md 写入"任何 terminal 命令先过 scope_gate"
3. **Guardian 二审集成**：scope 违规时 Guardian fail-closed

## Scope 文件格式（scope.txt）

```
# 授权范围声明 — 每行一个条目
# 支持格式：CIDR / 单 IP / 域名 / 子域名通配

# CIDR 块
192.168.1.0/24
10.0.0.0/8

# 单 IP
203.0.113.50

# 域名
example.com
*.example.com

# 注释：localhost/127.0.0.1 恒放行，无需声明
```

## 使用方法

### 1. 任务开始前创建 scope.txt

```bash
# 在 workspace 根目录创建
cat > scope.txt << 'EOF'
# 授权范围
192.168.1.0/24
*.target-company.com
EOF
```

### 2. 执行命令前校验

```bash
# 校验单个命令是否在 scope 内
python3 ~/.hermes/skills/hack-team/scope-gate/scripts/scope_gate.py check "nmap -sV 192.168.1.1"

# 校验整个脚本
python3 ~/.hermes/skills/hack-team/scope-gate/scripts/scope_gate.py check-script exploit.sh

# 严格模式（无 scope.txt 时 fail）
python3 ~/.hermes/skills/hack-team/scope-gate/scripts/scope_gate.py check "nmap target.com" --strict
```

### 3. SOUL 集成（hack-recon / hack-exploit）

在 profile SOUL.md 中加入：

```markdown
## 🔴 强制规则：Scope Gate 前置校验

执行任何涉及目标主机的 terminal 命令前，必须通过 scope_gate 校验：

1. 确认 `scope.txt` 存在于 workspace 根目录
2. 提取命令中的目标（IP/域名）
3. 调用 `scope_gate.py check "<command>"` 校验
4. 校验失败 → 拒绝执行，报告 scope 违规

**例外**：localhost/127.0.0.1 恒放行；无 scope.txt 时 warn 放行（非严格模式）。
```

## 检测的网络工具（60+）

| 类别 | 工具 |
|------|------|
| 端口扫描 | nmap, masscan, rustscan, naabu, zmap |
| Web 扫描 | nuclei, httpx, ffuf, gobuster, dirsearch, feroxbuster, wfuzz |
| 漏洞扫描 | sqlmap, nikto, wpscan, joomscan, droopescan |
| 密码攻击 | hydra, medusa, hashcat, john, crackmapexec |
| 网络工具 | curl, wget, nc, netcat, socat, telnet, ssh, smbclient, rpcclient |
| 侦察工具 | subfinder, amass, assetfinder, theHarvester, recon-ng, shodan |
| 其他 | ping, traceroute, dig, nslookup, host, whois |

## 误报过滤

以下模式自动过滤，不视为目标：
- 版本号：`1.2.3` 在 `v1.2.3` 或 `version 1.2.3` 中
- Python 方法链：`result.stdout`, `response.text`
- 文件扩展名：`.py`, `.txt`, `.json`, `.md`
- 本地路径：`/tmp/`, `/var/log/`, `~/`

## 输出示例

### 通过
```
✓ Scope check passed: nmap -sV 192.168.1.1
  Target 192.168.1.1 matches CIDR 192.168.1.0/24
```

### 阻断
```
🔴 SCOPE VIOLATION: nmap -sV 10.0.0.1
   Target 10.0.0.1 not in authorized scope
   Authorized: 192.168.1.0/24, *.target-company.com
   
   Exit code: 2 (hard block)
```

### 警告（无 scope.txt）
```
⚠️  No scope.txt found — proceeding with warning
   Create scope.txt in workspace root to enable strict enforcement
```

## Runbook 式授权门禁（Auth Gate，源自 plutox-sec-forge）

> 机制来源：plutox-sec-forge Autopilot——`--auth` 必填、授权依据写入 consent.txt、
> 爆破/利用类危险任务需单独 `--allow-dangerous` 显式放行
> （原始证据：workspace/websec-tools-survey/raw/tools/plutox-sec-forge_README.md，2026-09-09）。
> 与 scope.txt（管"打谁"）互补：本节管"凭据授权拿没拿到 + 危险操作是否单独放行"。

### 任务启动前的授权落盘（可操作步骤）

1. **拿到授权依据再开工**：授权编号/委托书编号/邮件批准链接，任一缺失 →
   不创建 scope.txt、不执行任何目标命令。授权依据不是"口头说过"。
2. **consent.txt 落盘**（与 scope.txt 同目录，任务全程保留）：

   ```bash
   # reports/<TARGET_SLUG>/consent.txt —— 每字段必填，无值写 UNSET 并视为未授权
   # authorized_by: <授权人/委托方 + 联系方式>
   # auth_ref: <授权编号/工单号，如 2026-001>
   # scope_ref: ./scope.txt
   # valid_from: <YYYY-MM-DD>  valid_until: <YYYY-MM-DD>
   # dangerous_allowed: no    # 仅当委托方书面批准爆破/利用类才改 yes
   ```

3. **每条目标命令执行前双查**：① `scope_gate.py check "<command>"` 校验目标在 scope 内；
   ② `grep -q "auth_ref: .*[0-9A-Za-z]" consent.txt` 确认授权依据已填实。
   任一失败 → 不执行，报授权缺口。

### 危险操作单独放行（--allow-dangerous 语义）

- 危险操作清单：密码爆破/凭据填充、漏洞利用（exploit payload 投递）、拒绝服务类、
  数据删除/篡改类。**扫描（recon/discovery/vuln 检测）不属于危险操作。**
- 危险命令必须**单独成行、单独执行、单独标注**，禁止夹带在扫描/枚举命令链中：

  ```bash
  # 危险操作执行记录——每条单独放行，逐条登记
  echo "[$(date '+%F %T')] DANGEROUS auth_ref=2026-001 cmd='hydra -L users.txt -P pass.txt ssh://192.168.1.10' approved_by=<委托方书面凭据>" >> reports/<TARGET_SLUG>/dangerous.log
  ```

- `dangerous_allowed: no`（默认）时任何危险命令直接拒绝；改 yes 需要委托方书面
  凭据落盘，不接受口头转述。

## 证据报告范式（命令/退出码/耗时/输出 → report.md + run.json）

> 机制来源：plutox-sec-forge Autopilot 证据报告——每个任务记录命令/退出码/耗时/输出，
> 合并生成 `reports/<target>/report.md` + `run.json`
> （原始证据同上）。与 fp-check 三态账本衔接：报告只收 Confirmed。

### 每任务四要素记录

每执行一条目标相关命令，登记四要素：**命令 / 退出码 / 耗时 / 输出**。落地为两个文件：

1. `reports/<TARGET_SLUG>/evidence/run.json`（机器可读，逐条追加）：

   ```json
   [
     {
       "id": 1,
       "command": "nmap -sV -p 1-1000 192.168.1.10",
       "exit_code": 0,
       "duration_sec": 42.7,
       "output_path": "evidence/out_001.txt",
       "dangerous": false,
       "auth_ref": "2026-001",
       "timestamp": "2026-09-09T13:20:00+08:00"
     }
   ]
   ```

2. `reports/<TARGET_SLUG>/report.md`（人读执行流水，与 run.json 一一对应）：

   ```markdown
   | # | 命令 | 退出码 | 耗时 | 输出 |
   |---|------|--------|------|------|
   | 1 | `nmap -sV -p 1-1000 192.168.1.10` | 0 | 42.7s | evidence/out_001.txt |
   ```

### 报告纪律

- 输出超长时正文存 `evidence/out_<id>.txt`，run.json 记 `output_path` 引用，报告表内不粘贴全文。
- `exit_code != 0` 的条目必须保留并注明原因（工具失败也是证据），禁止只报成功条目。
- 禁止事后补造 run 条目：run.json 行数 = 实际执行的目标命令数，对不上即在
  kanban_comment 说明差异原因。
- **与三态账本衔接**（`fp-check` §6，不另立定义）：run.json 记录的验证命令是
  Candidate → Confirmed 的晋级凭据之一；只有 fp-check 六门全 PASS 的 finding 才进
  报告正文，Candidate 只入附录标注「验证中」。

## 与 Guardian 集成

```python
# 在 codex-guardian-review 中集成 scope 校验
def review_command(cmd: str) -> ReviewResult:
    # 1. 先过 scope_gate
    scope_result = subprocess.run(
        ["python3", "scope_gate.py", "check", cmd],
        capture_output=True
    )
    if scope_result.returncode == 2:
        return ReviewResult.BLOCK("Scope violation")
    
    # 2. 再过 Guardian LLM 二审
    return guardian_llm_review(cmd)
```

## Source

Inspired by: https://github.com/mukul975/Threatswarm/blob/main/hooks/scope_check.py
Original: 226 lines, PreToolUse hook, exit 2 hard-block

## Related Skills

- `skillguard` — Skill 安全扫描
- `pentest-methodology-fusion` — 渗透方法论
- `codex-guardian-review` — Guardian 二审
