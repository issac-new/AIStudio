# 2026-11-03 离线包只打 git 跟踪文件＋版本名可覆盖（R146）

## 变更

1. `make-offline-bundle.sh` 技能树复制由 `cp -R 工作区` 改为 `git ls-files` 逐文件复制（非 git 树回落原逻辑）；排除口径（research/.swarm-yuan/offline-cache/ci/dist/docs、vendor-knowledge 门控）不变。
2. 新增 `SWARM_YUAN_OFFLINE_VER` 环境变量覆盖包名版本（缺省仍 `git describe`）。

## 决策记录

- **缺陷（2026-11-03 用户质询「everything 相比 src 多了什么」时实测发现）**：v1.0.9 everything 档内 `swarm-yuan/tests/` 比源码包多 34 条——`tests/e2e/java-demo/target/classes/*.xml`、`tests/e2e/java-demo/.swarm-yuan/trace.jsonl` 等**未跟踪的构建/运行残留**被 `cp -R` 一起打进去。v2.83.0 曾有「包内嵌套上层 dist 包」自我污染前例（R126-dist8 注释在案）。
- **口径**：发行物内容必须能从源码仓复现（`git archive` 等价），禁带本机痕迹。改为 `git ls-files` 白名单复制后，包内文件集 == 源码包文件集（排除项除外）。
- **版本名覆盖**：run25 复盘实证 tag 之后只要有无关提交，`git describe` 就产出 `v1.0.9-overlay-4-gxxxx`，导致资产命名与 SHA256SUMS 约定错位。发行脚本改为可显式指定，命名与 tag 解耦（provenance 仍由包内 `.bundle-version` 记录实际 describe 值，诚实留痕）。

## 验证

- 重建后实测：包内 `tests/` 无 `target/`、无嵌套 `.swarm-yuan`（对比修复前 34 条残留 → 0）；
- 知识库 318 条、npm tgz 0、pip whl 0 不变；包名恢复 `swarm-yuan-offline-v1.0.9-overlay-everything.zip`；
- `bash -n` 语法门过。

## 设计文档影响

DESIGN_SYNC: none——打包器实现修（不改变分发口径），口径仍为 R134（知识库在内、npm/pip 不打包）。
