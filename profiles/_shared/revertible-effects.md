# 可逆效果检查点（共享参考）

> 来源：deepseek-ai/deepseek-harness Cordis 论文《A Programming Paradigm for Spatiotemporal Composability》（2026-08-13）。
> 原文概念：Revertible Effects — 每个上下文变换都携带一个逆操作，运行时跟踪。
> 适配：Hermes 无 Cordis 运行时，但可通过检查点（checkpoint）模式实现粗略近似的「变更可回滚」能力。
> ⚠️ **重要限制**：Cordis disposer 是自动、运行时、per-effect 的逆操作；本文件的检查点是**手动、操作员负责**的，不是等价实现，是降级近似。
> ⚠️ **环境约束**：`~/.hermes` **不是 git 仓库**（实机验证无 `.git` 目录），所有检查点必须用 `cp`/`tar` 备份，**不能依赖 `git stash`**。
> 适用范围：所有涉及配置/SOUL/skill/memory 变更的 agent profile
> 强制级别：🟡 中高风险变更前应创建检查点（prompt 建议，无运行时强制）

---

## 一、核心理念

### 1.1 Cordis 的可逆效果

Cordis 框架中，每个 `ctx.effect()` 注册都返回一个 disposer。当插件卸载时，disposer 被调用，所有注册完全回退——没有残留。

```
ctx.effect(() => {
  const handle = registerSomething()
  return () => handle.dispose()  // 逆操作
})
```

### 1.2 Hermes 适配：检查点模式

Hermes 没有运行时 disposer 机制，但可以通过**变更前快照**实现等效能力：

```
变更前 → 创建 checkpoint（快照 + 回滚命令）
变更中 → 执行修改
变更后 → 验证成功 → 提交 / 验证失败 → 回滚到 checkpoint
```

---

## 二、风险三级分类

| 风险级别 | 变更类型 | 检查点要求 | 回滚方式 |
|---------|---------|-----------|---------|
| **L1 低** | workspace 内文件创建/修改 | 无需显式检查点（workspace 天然可弃） | 删除或重写 |
| **L2 中** | `_shared/*.md` 修改、skill 内容修改、SOUL.md 增量编辑 | 变更前 `cp` 或 `tar` 备份 | `cp` 还原 |
| **L3 高** | config.yaml 修改、profile 创建/删除、batch SOUL.md patch、memory 批量重写 | 变更前完整 `tar` 备份 + 记录 rollback 文件路径 | `tar xzf` 或 `cp` 恢复 |

> ⚠️ `~/.hermes` 不是 git 仓库，**不要用 `git stash`**——只能用 `cp`/`tar`。

### L3 变更的检查点流程

```bash
# 1. 变更前：创建 tar 检查点
TS=$(date +%Y%m%d_%H%M%S)
tar czf "/tmp/hermes_checkpoint_${TS}.tar.gz" -C ~/.hermes config.yaml profiles/_shared/
echo "checkpoint: /tmp/hermes_checkpoint_${TS}.tar.gz" > /tmp/rollback_point.txt

# 2. 执行变更
# ... 修改 config.yaml / 批量 patch SOUL.md ...

# 3. 验证
python3 -c "import yaml; yaml.safe_load(open('$HOME/.hermes/config.yaml'))"  # 语法检查
# ... 运行相关验证命令 ...

# 4a. 验证通过 → 可删除检查点
rm /tmp/hermes_checkpoint_${TS}.tar.gz

# 4b. 验证失败 → 回滚（注意用具体文件名，不用 glob 避免多文件冲突）
tar xzf "/tmp/hermes_checkpoint_${TS}.tar.gz" -C ~/.hermes/
```

---

## 三、六类常见变更的检查点模板

### 3.1 config.yaml 修改

```bash
# 检查点
cp ~/.hermes/config.yaml ~/.hermes/config.yaml.rollback_$(date +%Y%m%d_%H%M%S)

# 验证
python3 -c "import yaml; yaml.safe_load(open('$HOME/.hermes/config.yaml'))"

# 回滚
cp ~/.hermes/config.yaml.rollback_* ~/.hermes/config.yaml
```

### 3.2 batch SOUL.md patch（多文件）

```bash
# 检查点
cd ~/.hermes/profiles
tar czf /tmp/souls_backup_$(date +%Y%m%d_%H%M%S).tar.gz */SOUL.md

# 验证：每个 SOUL.md 行数变化 < 30%（防意外大改）
for f in */SOUL.md; do
  lines=$(wc -l < "$f")
  echo "$f: $lines lines"
done

# 回滚
tar xzf /tmp/souls_backup_*.tar.gz -C ~/.hermes/profiles/
```

### 3.3 skill 创建/修改

```bash
# skill 目录不是 git 管理，用 cp/tar 备份
SKILL_DIR=~/.hermes/profiles/orchestrator/skills/devops/<skill_name>
# 检查点
tar czf "/tmp/skill_backup_$(date +%Y%m%d_%H%M%S).tar.gz" "$SKILL_DIR"

# skill_manage 操作后验证
skill_view(name='<skill_name>')  # 确认可加载

# 回滚（用具体文件名）
LATEST=$(ls -t /tmp/skill_backup_*.tar.gz | head -1)
tar xzf "$LATEST" -C /
```

### 3.4 memory 批量重写

```bash
# memory 无法直接 cp（存在内部格式），但可以导出
# 检查点：在操作前用 memory tool 记录当前状态摘要
# （memory 是 append-only，不应批量删除）

# 安全做法：用 operations 批量改而非逐条
# 一次 operations 调用如果失败，部分应用 + 部分未应用
# 所以 batch 前先记录 old_text 列表
```

### 3.5 kanban 跨 board 路由变更

```bash
# kanban.db 是 SQLite，可备份
DB=~/.hermes/kanban/boards/<board>/kanban.db
TS=$(date +%Y%m%d_%H%M%S)
cp "$DB" "${DB}.rollback_${TS}"

# 回滚（用具体文件名，不用 glob 避免多文件冲突）
LATEST=$(ls -t "${DB}.rollback_"* | head -1)
cp "$LATEST" "$DB"
```

### 3.6 _shared/ 规则修改

```bash
# 共享规则影响全集群，最高风险
SHARED=~/.hermes/profiles/_shared
tar czf /tmp/shared_backup_$(date +%Y%m%d_%H%M%S).tar.gz -C $SHARED .

# 验证：规则文件语法 + 引用完整性
for f in $SHARED/*.md; do
  echo "--- $f ---"
  head -5 "$f"  # 确认头部完整
done

# 回滚
tar xzf /tmp/shared_backup_*.tar.gz -C $SHARED/
```

---

## 四、agent 变更协议（写入 kanban metadata）

L2/L3 变更在 kanban_complete 的 metadata 中标注：

```python
kanban_complete(
    summary="批量增强 5 个 SOUL.md",
    metadata={
        "change_type": "batch_soul_patch",
        "risk_level": "L3",
        "checkpoint": {
            "method": "tar.gz backup",
            "path": "/tmp/souls_backup_20260813_223000.tar.gz",
            "files_affected": 5,
            "rollback_command": "tar xzf /tmp/souls_backup_*.tar.gz -C ~/.hermes/profiles/"
        },
        "verification": {
            "syntax_check": "passed",
            "line_count_delta": "+12 lines total",
            "no_breakage": True
        }
    }
)
```

---

## 五、不可逆操作清单（必须 Human Gate）

以下操作**无法通过检查点回滚**，必须走 Human Gate 审批：

| 操作 | 理由 | 处置 |
|------|------|------|
| `git push`（非主分支/PR） | 推送到远端 | 中风险：kanban_comment 留痕（对齐 revertibility-grading.md） |
| `git push`（main/force push） | 重写历史/不可撤销 | kanban_block(HumanGate:HIGH) |
| `git push --force` | 重写历史 | kanban_block(Human Gate:HIGH) |
| 发送邮件/微信消息 | 已送达不可撤回 | kanban_block(Human Gate:HIGH) |
| 部署到生产环境 | 影响真实用户 | kanban_block(Human Gate:HIGH) |
| 删除 git 分支 | 引用丢失 | kanban_block(Human Gate:HIGH) |
| `rm -rf` 非 workspace 目录 | 可能删重要数据 | kanban_block(Human Gate:HIGH) |
| 安装系统级软件 | 影响全局环境 | kanban_block(Human Gate:MED) |

---

## 六、与其他共享规则的关系

| 规则文件 | 与本文件的关系 |
|---------|--------------|
| `defensive-patterns.md` | 防御性规则是**运行时**防线；本文件是**变更时**防线 |
| `loop-engineering-gates.md` | 验证门检查产出正确性；本文件确保产出失败时可回退 |
| `forward-deployed-protocol.md` | 前线侦察是变更前理解现状；本文件是变更前保护现状 |
| `marking-rules.md` | markings 传播是不可逆的权限决策，走 Human Gate 而非检查点 |

---

## 附录：检查点命名规范

```
<target>.rollback_<YYYYMMDD>_<HHMMSS>
```

示例：
- `config.yaml.rollback_20260813_223000`
- `souls_backup_20260813_223000.tar.gz`
- `kanban.db.rollback_20260813_223000`

清理策略：成功验证后可删除检查点文件；保留最近 3 个检查点用于回溯。
