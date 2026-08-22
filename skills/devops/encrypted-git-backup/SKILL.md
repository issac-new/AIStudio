---
name: encrypted-git-backup
description: 敏感产物非对称加密后备份到私有Git仓库，私钥留本地。含混合加密与防丢失自动提交。
triggers:
  - "加密备份到GitHub"
  - "workspace backup encrypted"
  - "备份工作区到私有仓库"
  - "敏感内容加密推送"
  - "非对称加密备份"
---

# Encrypted Git Backup（敏感工作产物加密备份）

将本地 workspace 备份到私有 GitHub 仓库，敏感内容以非对称加密密文形式存储，私钥仅留本地。

## 核心原则

1. **内容分级**：明文(普通产物) / 密文(敏感内容加密) / 排除(不备份)
2. **私钥永不上云**：RSA 私钥仅存于本地安全路径，绝不进任何仓库
3. **第三方代码不备份**：有上游来源的代码(git clone 的库)无需备份——**仅备份本地产出物**（用户明确指示）

## 标准流程

### 1. 生成 RSA 密钥对（一次性）

```bash
mkdir -p ~/.hermes/secrets
cd ~/.hermes/secrets
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out <name>_private.pem
openssl pkey -in <name>_private.pem -pubout -out <name>_public.pem
chmod 600 <name>_private.pem   # 私钥仅本人可读
```

### 2. 混合加密（cryptography 库）

RSA 直接加密有 ~446 字节上限，**必须混合加密**：AES-256-GCM 加密数据 + RSA-OAEP 加密 AES key。用 Python `cryptography` 库（macOS 的 LibreSSL `openssl enc` 不支持 GCM AEAD，会报 "AEAD ciphers not supported"）。

完整脚本见 `scripts/hybrid-encrypt.py`。封装格式（base64 三行）：
```
<rsa-encrypted-aes-key>
<aes-nonce>
<aes-gcm-ciphertext>
```

解密脚本见 `scripts/hybrid-decrypt.py`。

### 3. 内容分级决策表

| 类别 | 处理 | 示例 |
|------|------|------|
| 普通工作产物 | 明文推送 | 审计报告、调研数据、设计文档 |
| 个人/家庭 PII | 加密 → `enc-archive/` | 孩子成长档案、家庭反思、私人分析 |
| 第三方代码 | **排除不备份** | git clone 的开源库（有上游） |
| 红线内容 | **排除不备份** | 客户机密、内网架构、法律案件 |
| 密钥/凭据 | 排除 + gitignore | `.env`、token、私钥 |

### 4. .gitignore 配置

加密后的敏感内容推 `enc-archive/`，其**明文原件必须 gitignore**（防止误推明文）。红线内容（不备份的）也加入 gitignore 双保险。`.DS_Store` 若曾被跟踪，需 `git rm --cached` + 重新 add 才生效。

### 5. 自动提交（防丢失）

launchd 定时任务，见 `templates/auto-push-launchd.plist`（间隔 30 分钟）+ `templates/auto-push.sh`。脚本先检查变更再 commit+push，无变更时静默退出。

## 关键陷阱

### GitHub 100MB 单文件限制
加密后单文件 >100MB 会被 remote 拒绝（`GH001: Large files detected`）。两个解法：
- **首选：重新评估该内容是否需要备份**（大文件往往是第三方代码 → 按原则3排除）
- 备选：git-lfs（`git lfs track "enc-archive/*.enc"`），但会显著拖慢 push

### git 历史已含大文件时
若大文件已被 commit 进历史，`git rm` 不够——需 filter-branch 清理：
```bash
git rm --cached <big-files>           # 先提交移除
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch <big-files>' \
  --prune-empty --tag-name-filter cat -- --all
git reflog expire --expire=now --all && git gc --prune=now --aggressive
rm -rf .git/lfs/objects               # 若用过 git-lfs，清理残留
```
注意：filter-branch 对 worktree 分支(`wt/*`)无效，可先 `git branch -D` 删除临时分支。清理后需 `git push --force`（仅限刚建的新仓库）。

### 密钥扫描误报
粗放的 `api_key|key` 正则会把 "monkey"、"keyword" 误判为密钥。用精确模式：`sk-[A-Za-z0-9]{20,}`、`gho_`、`AKIA[0-9A-Z]{16}`、`-----BEGIN.*PRIVATE KEY-----`。

## 验证清单（推送前必做）

- [ ] 精确密钥扫描通过（无真实凭据）
- [ ] 加密文件可解密（用私钥测试 2-3 个代表性 .enc）
- [ ] 明文敏感文件在 gitignore 中且未跟踪
- [ ] 红线内容确认未出现在暂存区
- [ ] 仓库为 PRIVATE
- [ ] 私钥文件权限 600 且不在仓库内

## Reference Files

- `scripts/hybrid-encrypt.py` — AES-256-GCM + RSA-OAEP 混合加密（目录自动 tar）
- `scripts/hybrid-decrypt.py` — 解密验证脚本
- `templates/auto-push.sh` — 防丢失自动提交脚本
- `templates/auto-push-launchd.plist` — launchd 定时配置（30分钟间隔）

## Related Skills

- **github-repo-management** — gh CLI 仓库创建/管理
- **kanban-worktree-workspace** — workspace 持久化（本地方案，与此互补：本地防丢 vs 云端备份）
- **privacy-hardening** — 隐私分层防护
