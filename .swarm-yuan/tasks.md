# 任务计划：离线安装包（Windows amd64）

spec：`docs/superpowers/specs/2026-11-02-offline-windows-package.md`（D1-D13，已批准）
分支：feat/offline-win-package（worktree）

## 步骤

1. [x] 设计 spec＋附录 A.1 登记＋builder-check 五问清偿＋用户批准（含两追加：Teams 默认全装 D12、zcode AGENTS.md D13）
2. [x] 模板正本 `scripts/offline-template/`：zcode/AGENTS.md（脱敏，两处误删条款已补回）、env/dot-env.example＋env-vars.md、install/install-windows.ps1＋.bat＋README-windows.md
3. [x] 打包器 `scripts/make-offline-package.mjs`：git archive→aistudio/、agent 树采集（两轮实测扩充排除：.venv 族/.hermes-runtime/.worktrees/dist/release/build/.cache）、local-mods.patch（GIT_INDEX_FILE 临时索引——活体树锁竞态根治，maxBuffer 512MB）、env/config 派生（team/config.yaml）、脱敏三层判据（真实值哈希对撞 fatal／测试文档面＋假值标记降级／其余 fatal）、SHA256SUMS＋zip＋报告
4. [x] 测试：`scripts/__tests__/make-offline-package.test.ts`（10 用例）；windows-compat guard 增补 4 断言（registry 禁写死/无 bash/四要素/AGENTS 无本机路径）
5. [x] 本机实测打包（第 4 轮过）：zip 463MB；必含 9 件全在；必不含（.git/venv 族/.hermes-runtime/node_modules/.env/desktop release）全零；SUMS 解压回验进行中
6. [x] 文档接线＋节点⑦审查（有条件过→P0/P1 全修）＋最终全量 7231/0＋合并 main 71d01301b＋worktree 收口净

## 实测坑（已根治，防复发机制=try/finally＋临时索引＋排除清单＋三层判据）

- spawnSync 默认 maxBuffer 1MB——git diff 大补丁必炸（改 512MB）
- 活体 agent 树有 hermes 网关进程并发碰 git——直改真 index 撞 index.lock（改 GIT_INDEX_FILE 临时索引零接触）
- 块注释里写 `.venv.bak-*/`——`*/` 提前闭合注释（措辞改写；语言陷阱清单类）
- isDummySecret 前缀标记 `^` 锚整串——`sk-abc...` 匹配不到（改「前缀后跟」匹配）
