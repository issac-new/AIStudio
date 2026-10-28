---
name: fusion-evidence-commit-hygiene
description: "Use when 融合/调研卡证据目录 commit 入库：嵌套仓假入库/敏感误判/快照膨胀三防+多仓版本覆盖地图."
version: 1.0.0
metadata:
  hermes:
    tags: [git, evidence, fusion, closeout]
    related_skills: [shared-workspace-git-commit, incremental-repo-research, orchestrator-lessons]
---

# 融合卡证据目录入库三防 + 多仓版本覆盖地图

> 定位：`shared-workspace-git-commit`（default 侧，权威源）管共享仓 commit 通用七步；
> `incremental-repo-research` 管增量调研与融合执行流程。本 skill 只补两者未覆盖的
> 三个实测缺口：①嵌套 git 仓假入库；②敏感扫描命中定性；③多仓环境的版本覆盖地图
> 与无版本区披露。通用 commit 纪律查母本，此处不复制。

## When to Use

- worker 产出的证据目录（fixtures / changed.diff / dryrun / verify 日志 / 上游 clone）随「commit」指令入库
- 调研产物含上游 tarball/源码快照，犹豫要不要一并入库
- 多仓环境（工作仓 + _shared 协议仓 + 镜像仓）收口，需判断哪个仓收哪部分改动

## 三防（逐项过，缺一不可）

### 1. 防嵌套仓假入库

worker 在 workspace 里 clone 的上游 demo/子模块目录，`git add` 递归收编时只写
gitlink（mode 160000）——内容不真入库，事后克隆者拿不到也无处拉取，`git add`
时的 warning（`adding embedded git repository`）是唯一实时信号。

```bash
# add 后查（git status --cached 不是合法旗标，查 staged 一律用 git diff --cached）
git diff --cached --summary | grep 160000
# 命中即剔除再 amend
# 子仓本体留盘，报告引用其绝对路径即可
git rm --cached <embedded-repo-path>
git commit --amend --no-edit
```

### 2. 防敏感误判（命中先定性，勿一刀切排除）

脱敏/检测类融合卡的 fixtures 与 changed.diff 常自含构造假 key（键盘序/顺数字
样张）——敏感扫描命中 ≠ 泄露。

```bash
# ① 宽松扫描（宽松正则防漏检；空=干净）
grep -rln "sk-[a-zA-Z0-9]\{20,\}\|api_key.*=.*['\"][a-zA-Z0-9]\{16,\}" <候选目录> | head -3
# ② 命中后回对 fixtures 源文件定性：同串在样本文件中=构造样张，可入库
grep -n "<命中串>" <fixtures 源文件>
# ③ 确认真凭据形态才单独排除并告知用户
```

一刀切排除会把脱敏验收证据挡在版本史外，误报还会稀释下次扫描的信噪。

### 3. 防快照膨胀

上游 tarball/源码快照（百 MB 级）不入库——报告+release notes+证据 JSON 足够
复验，快照留盘供蓝军重拉比对：

```bash
du -sh <候选目录> | sort -rh | head -10
find <候选目录> -type f -size +5M | head
``n

## 多仓版本覆盖地图（commit 前必画）

多仓环境（本机三仓+无版本区）先画地图再动手——「commit 掉」落到哪个仓、哪部分
改动不在任何 git 管辖，逐项核对：

| 仓 | 收什么 | 纪律 |
|---|---|---|
| 工作仓（workspace） | 调研报告/证据目录/设计文档 | 嵌套仓剔除（三防·1）；历史累积改动多时点名 add，勿 `add -A` |
| `_shared` 协议仓 | 治理协议增节 | 点名 add 只收本轮文件，并行会话脏文件不混入 |
| 镜像仓（`soul_git_sync.py`） | skill 层改动 | sync bot 自动收编成它自己的 commit，**勿手动 commit**；核对新 skill 入镜像用 `git -C ~/.hermes/backup/soul-integrity-git log --oneline --all -- skills/<path>/`，不假定 HEAD（bot 会把并行改动收进更早 commit） |
| `~/.hermes/bin|scripts|services` 的 .py/.md 工具 | 融合产出脚本 | **无版本区**：不在任何仓管辖——commit 时如实披露并给选项（扩镜像白名单 or 移入 _shared 仓），禁静默当作已提交 |

## 与母本的分工

- 共享仓通用 commit 七步（侦察→预览→批准→index.lock→commit→复查→push 政策）→ `shared-workspace-git-commit`
- 增量调研与融合执行派卡/验收流程 → `incremental-repo-research`
- env 劫持建卡落错板 → `orchestrator-lessons` §六·坑 5（建卡永远显式传 board=）
- 本 skill 补：三防 + 多仓地图，均母本未覆盖
