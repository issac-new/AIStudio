---
name: hermes-incremental-offline-packaging
description: "生成自上次导出以来的增量离线更新包并上传 ModelScope。"
version: 1.0.0
metadata:
  hermes:
    tags: [offline, packaging, modelscope, incremental, powershell, verification]
    related_skills: [modelscope-offline-distribution, github-profile-distribution, hermes-offline-migration, fusion-skill-placement]
---

# Hermes 增量离线更新包（Incremental Offline Update Package）

> 2026-08-06 实测提炼（三源融合后生成 increment-20260806b.zip 上传 ModelScope）。
> 场景：上次全量/增量导出之后有少量变更（新 skill、rules 修改），只需打增量包，不必重建全量离线包。

## When to Use

- 用户说"生成自上次导出以来的增量离线更新包并上传 modelscope"
- 上次导出（git commit）之后只新增/修改了少量 skill、rules、scripts
- 需要同时给 macOS/Linux 和 Windows 目标机发更新

## 核心流程（7 步）

### 1. 定位上次导出边界

```bash
cd /Volumes/YOURVOLUME/lab/ollamalinux/ollama   # ModelScope 本地工作目录
git log --oneline -10 --date=short --pretty='%h %ad %s'
git ls-files | grep -E "\.zip$|\.tar\.gz$"      # 现有离线包，确认上次增量包名（如 increment-20260806.zip）
```

**增量 = 自上次提交时间之后修改的所有 profile/skill 文件**。用 `-newermt "<上次提交时间>"` 找变更文件，再人工核对本会话改了什么。

### 2. 组装增量目录（只放变更文件）

```bash
cd /tmp && rm -rf inc-new && mkdir -p inc-new/skills/{devops,devops-worker} inc-new/profiles/{orchestrator,worker-coder,_shared}
# 新 skill：按适配性归位（见 fusion-skill-placement）
for s in <编排类>;        do cp -R ~/.hermes/skills/devops/$s inc-new/skills/devops/; done
for s in <执行类>;        do cp -R ~/.hermes/skills/devops-worker/$s inc-new/skills/devops-worker/; done
# 修改的 rules：复制真实文件
cp ~/.hermes/profiles/orchestrator/orchestrator_rules.md inc-new/profiles/orchestrator/
cp ~/.hermes/profiles/worker-coder/worker-coder_rules.md inc-new/profiles/worker-coder/
cp ~/.hermes/profiles/_shared/{marking-rules,shared-rules-reference}.md inc-new/profiles/_shared/
```

### 3. 双平台应用脚本（.sh + .ps1）

- `apply-increment-<date>.sh`：bash 版。幂等（已存在 skill 跳过、rules 覆盖）。含 [1/3] skill → [2/3] rules → [3/3] 验证 三段式。
- `apply-increment-<date>.ps1`：PowerShell 版。`param([string]$HermesHome = Join-Path $env:USERPROFILE ".hermes")`；用 `Get-ChildItem -Recurse -File` 复制树；验证用 `-match` 检查 marker 字符串。
- **ps1 中的 marker 必须与真实文件内容一致**——先 grep 真实 rules 文件确认 marker 存在，再写进 ps1（2026-08-06 教训：写了个"共享 skills 索引"marker，真实文件是"新增共享 skills"，静态验证抓出后修正）。

### 4. 脱敏（增量包也要全量扫描）

增量包中的 rules 常含真实邮箱/路径（orchestrator_rules.md 里写死了 `your-inbox@example.com`）。**扫描模式必须包含邮箱与用户路径，不能只扫 API key**：

```bash
grep -rnE "sk-[a-zA-Z0-9]{20,}|syt_[a-zA-Z0-9_]{20,}|/Users/YOURNAME|your-inbox@|swarmstudio@|<main-bot-account-id>" <pkg-dir>
# 命中邮箱 → sed 替换为 your@email.com 后重新打包
```

### 5. 打包 + 模拟应用自检

```bash
cd inc-new && zip -r /tmp/increment-<date>.zip . -x '*.DS_Store'
# 模拟应用：解压到临时 sim-home，跑 .sh 验证 12 skill + 4 rules 全落位
```

### 6. 上传 ModelScope

```bash
cd /Volumes/YOURVOLUME/lab/ollamalinux/ollama
cp /tmp/increment-<date>.zip .
git add increment-<date>.zip && git commit -m "update: <描述>" && git push origin master
# LFS 自动上传；等待 remote Validation passed
```

### 7. 远程下载验证（必须，不可省）

```bash
curl -sSL -o /tmp/inc-verify.zip -w "HTTP %{http_code}, %{size_download} bytes\n" \
  "https://www.modelscope.cn/models/tupang/ollama/resolve/master/increment-<date>.zip"
# ⚠ 必须加 -L（ModelScope 302 跳 CDN），不加 -L 会拿到 343 字节重定向页而非 zip
unzip -q /tmp/inc-verify.zip && grep -c "<新规则marker>" profiles/... && ls skills/devops/
```

## Pitfalls

1. **增量包脱敏不全**：只扫 API key 会漏掉真实邮箱/用户名路径。复用 `github-profile-distribution` 的完整 REPLACEMENTS 模式（邮箱/path/token 全覆盖）。
2. **ps1 无法在 macOS 真跑**（无 pwsh）：用静态验证——括号配平（去注释+字符串后计数）+ Python 模拟 PowerShell 的 `-match` 逻辑 + 模拟应用/幂等。对 target 机诚实声明"静态验证非执行验证"。
3. **marker 与真实文件不一致**：ps1 验证段 grep 的 marker 必须先在真实 rules 里 grep -c 确认存在，否则目标机永远验证失败。
4. **skill 归位后 rules 索引不同步**：融合 skill 归位（devops ↔ devops-worker）后，`orchestrator_rules.md` §0.7.x 和 `_shared/shared-rules-reference.md` 的 skills 表可能仍写旧路径——打包前 grep 检查 stale 引用。
5. **同一 zip 覆盖上传**：同一文件名多次 commit，ModelScope 以最新 commit 为准，远程验证必须下载后解压检查最新内容（grep 新 marker）。
6. **zip 内目录为空时 unzip 报 EOCD**：下载验证遇 `End-of-central-directory signature not found` = 拿到的是 302 重定向页，加 `-L` 重试。

## 验证清单（打包交付前）

- [ ] 增量内容 = 自上次 commit 的变更（git diff 核对）
- [ ] .sh 模拟应用通过（sim-home 全落位）
- [ ] ps1 静态验证通过（brace + marker + manifest + 幂等）
- [ ] 密文扫描 0 命中（含邮箱/路径，非仅 key）
- [ ] 远程下载 HTTP 200 + 解压内容含新 marker
- [ ] README 记录安装命令（bash / powershell 两版）

## Related Skills

- **modelscope-offline-distribution** — 全量离线包重建+上传（本 skill 是其增量变体）
- **github-profile-distribution** — 完整脱敏 REPLACEMENTS 模式来源
- **hermes-offline-migration** — 全量离线迁移（walk-and-copy、三层凭据泄露源）
- **fusion-skill-placement** — skill 归位（devops vs devops-worker）判定
