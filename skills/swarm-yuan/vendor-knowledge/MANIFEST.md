# vendor-knowledge — 领域知识实体镜像（学习研究用途）

> 本目录镜像依赖本机 hermes 运行时（非 npm/pip 可装）的领域知识实体，供迁移到其它机器后 swarm-yuan 引用可达。
> **使用立场**：`standards/` `books/` `fulltext/` 为第三方规范全文与版权材料（EMVCo/银联规范、《支付之门》、付费专栏文章），**仅供学习研究使用，不分发、不商用**；大文件走 git LFS 管理，迁移经内部远端或本地拷贝。`.gitattributes` 的 LFS 跟踪规则已入库（可安全 push 公开仓），实体内容仅在私有分支/本地流转。

## 目录

| 路径 | 来源 | 体量 | 性质 |
|---|---|---|---|
| `pay-team/references/` | `~/.hermes/profiles/pay-orchestrator/references/` | 24M / 300 文件 | 支付领域知识库（pay-team 四人格深读材料） |
| `pay-team/references/standards/` | 同上 standards/ | 20M | 银联/EMV/PBOC/ISO 规范全文（**LFS，学习研究**） |
| `pay-team/references/books/` | 同上 books/ | 2.1M | 《支付之门》14 章 +《跨境支付及金融服务》7 章（**LFS，学习研究**） |
| `pay-team/references/fulltext/` | 同上 fulltext/ | 1.8M | 陈天宇宙支付专栏 50 篇（**LFS，学习研究**） |
| `pay-team/references/*.md/json`（顶层） | 同上 | ~150K | 自研索引/内核框架/known-conflicts 裁决（普通 git） |
| `_shared/` | `~/.hermes/profiles/_shared/`（裁剪） | 3 文件 | 四论四问/语言规范/输出契约（SOUL.md 实际引用项） |

## 引用方

- `references/industry-profile-payment.md` §7 —— 领域知识库锚点路由（指向本目录的仓内相对路径）。

## 同步与校验（迁移/刷新）

```bash
bash scripts/sync-vendor-knowledge.sh          # 从 ~/.hermes 镜像（SRC=<path> 自定义源）
bash scripts/sync-vendor-knowledge.sh --check  # 校验镜像完整性（不拉取）
```

克隆机取回 LFS 实体：`git lfs pull`（未拉取时版权大文件为 130B 指针，降级为知识地图）。

## 引用纪律

引用任何限额/阈值/费率/版本数据前，先查 `pay-team/references/standards/known-conflicts.md` 的冲突裁决。
