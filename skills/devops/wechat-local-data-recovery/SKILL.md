---
name: wechat-local-data-recovery
description: 从微信 Mac 本地 msg/file 目录恢复丢失的产物文件。当 scratch 工作区清理导致产物丢失时使用。
triggers:
  - "从微信恢复"
  - "微信端下载恢复"
  - "微信消息找回"
  - "丢失产物恢复"
  - "msg/file 恢复"
---

# WeChat Local Data Recovery（微信 Mac 本地数据恢复）

当任务产物丢失（如 scratch workspace 被清理）但曾通过微信发送过（附件/PDF/文件），可从微信 Mac 本地数据目录恢复。**这是恢复渠道的优先路径**——微信 Mac 版把发送过的文件保存在本地明文目录。

## 关键路径

```
~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/
  <user>_<hash>/
    msg/file/<yyyy-mm>/          # ✅ 所有通过微信发送的文件附件(明文,可直接复制)
    msg/attach/<hash>/<yyyy-mm>/Img/*.dat   # 图片(加密格式 .dat,需转换)
    msg/file/                    # 按月分目录,含 .pdf/.html/.docx/.zip
    db_storage/message/          # 消息数据库(加密,不可直接读)
```

关键：`msg/file/` 下的附件**是明文的**，文件名保留原样（含中文），可按月浏览。

## 恢复流程

1. **定位微信数据目录**：
   ```bash
   WX=~/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/*/msg/file
   ls -la "$WX/2026-08/" | head   # 按月查看
   ```

2. **用 glob 批量匹配文件名**（文件名可能含括号 `(1)`、中文、空格，bash 直接 cp 会因括号转义失败）：
   ```python
   import glob, shutil, os
   for f in glob.glob(os.path.join(WX, '2026-08', 'mom-game-lessons*.pdf')):
       shutil.copy2(f, dest)      # 用 Python shutil,不要用 bash cp 带括号
   ```

3. **验证内容真实性**：用 `read_file` 或 pymupdf 提取 PDF 文本，确认恢复的文件确实是丢失任务的产物（对比任务标题/日期/内容）。

4. **存档到持久位置**：恢复到 workspace 后 `git commit`（如 [已移除]-archive 恢复案例 commit b05398c）。

## 不可行路径（诚实声明）

- **消息数据库是加密的**（SQLCipher，magic bytes 随机）——`sqlite3` 打开报 "file is not a database"，密钥在系统 Keychain，无法直接解密
- **微信 AX 树不暴露聊天文本**——AppleScript `entire contents` 返回空，无法 GUI 读取消息内容
- **vision 配额可能耗尽**——截图辅助分析不可靠时，走文件路径优先

## 真实案例

[已移除] 两个 scratch 任务（亲子互动游戏、情绪社交）产物被清理后，从 `msg/file/2026-08/` 恢复 16 个文件：
- `mom-game-lessons*.pdf`（9 版本）→ 亲子互动游戏教案集
- `child-dialogue-analysis*.pdf` + `activity-analysis-0805*.pdf` → 情绪社交分析
- `[已移除]-team-ppt*.pdf` → 团队 PPT
恢复后 git commit 存档，密文副本进 `enc-archive/`。

## 配合技能

- **encrypted-git-backup** — 恢复的敏感文件加密备份到私有仓库
- **kanban-worktree-workspace** — 预防：kanban 任务禁 scratch，产物才不丢
- **weixin-send-troubleshooting** — 微信发送通道故障（出向）
