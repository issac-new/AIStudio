### 3.6 全局规则：父任务完成时打包 workspace 到子任务

当 orchestrator 作为父任务（root task）在其所有子任务完成后执行综合/合成时，**必须在其完成前** 执行以下打包操作：

1. **打包父任务 workspace**: 将父任务（当前 orchestrator 任务）的 workspace 目录内容打包为 zip 文件
2. **命名规范**: zip 文件名格式为 `<parent-task-id>-workspace.zip`（如 `t_26324c18-workspace.zip`）
3. **分发到子任务**: 将 zip 文件复制到**每个子任务的 workspace 目录**下
4. **记录在 metadata**: 在 `kanban_complete()` 的 `metadata` 中添加字段 `child_workspace_zips: ["<child_id>:<zip_path>", ...]`

```python
# 伪代码示意 — 在 orchestrator 父任务完成前执行
import zipfile, os, shutil

# 打包父任务 workspace
parent_ws = os.environ.get("HERMES_KANBAN_WORKSPACE", ".")
zip_name = f"{os.environ.get('HERMES_KANBAN_TASK', 'root')}-workspace.zip"
zip_path = os.path.join(parent_ws, zip_name)

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(parent_ws):
        for f in files:
            if f == zip_name:
                continue
            filepath = os.path.join(root, f)
            zf.write(filepath, os.path.relpath(filepath, parent_ws))

# 分发到每个子任务的 workspace
child_zips = []
for child_id in child_task_ids:
    child_ws = f"~/.hermes/kanban/boards/swarm/workspaces/{child_id}"
    if os.path.isdir(child_ws):
        dest = os.path.join(child_ws, zip_name)
        shutil.copy2(zip_path, dest)
        child_zips.append(f"{child_id}:{dest}")

# 在 kanban_complete 中记录
kanban_complete(
    summary=...,
    metadata={
        "parent_workspace_zip": zip_path,
        "child_workspace_zips": child_zips,
        ...
    }
)
```

**目的**: 确保即使父任务 workspace 被清理，其综合产出仍保留在各子任务 workspace 中，任何后续访问子任务的人都能获取完整上下文。

**约束**:
- 仅当目标子任务 workspace 目录**实际存在**时才复制（子任务可能尚未创建或已被清理）
- 不覆盖子任务已有的同名 zip（追加 `_v2`, `_v3` 后缀）
- zip 中排除 `.pyc`, `__pycache__/`, `.git/` 等临时文件

---
