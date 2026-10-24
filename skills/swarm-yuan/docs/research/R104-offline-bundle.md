# R104 离线安装包轮（2026-10-09，v2.67.0）

> 触发：用户指令「打一个离线的 swarm-yuan skill 安装包，目标离线 Windows 机器（npm/pip 镜像源可解决部分依赖，版权考量豁免）」。

## 一、产物与结构

`scripts/make-offline-bundle.sh <输出目录>`（可复用构建器，随包分发）→ `swarm-yuan-offline-<git-describe>.zip`：

- `swarm-yuan/`：技能本体，分发边界与 install.sh 一致（research/.swarm-yuan/offline-cache/ci 不入包）。**离线完备**——核心能力（生成技能/门禁/spec-first 四层拦截/提交时 pre-commit）零外部依赖；外部运行时缺装按诚实降级链运行（capability-map §三）。
- `vendor/npm/*.tgz` + `vendor/pip/`：运行时本地包，目标机免源安装（`npm i -g ./x.tgz`；`python3 -m pip install --no-index --find-links`）；未入 vendor 者走目标机镜像源补装。
- `install-offline.bat/.sh` + `README-OFFLINE.md`：Windows 入口（Git Bash 前置）+ 安装器（`--claude|--zcode|…|--all` + `--with-npm --with-pip`）+ 降级语义说明。

实测产物（2026-10-09，基线 commit 9a4d2f8）：38MB，vendor 9/9 零失败（npm 8 + pip 1）；隔离假 HOME 验收通过（安装链路/SKILL.md/precheck 可执行/R103 资产在位）。

## 二、清单与通道事实（scripts/offline-manifest.conf，口径源 upstream-baseline）

npm 通道：@fission-ai/openspec@1.14.1、@openai/codex-security@0.2.0、@alibaba-group/open-code-review@1.12.13、claude-mem@13.24.5（npm 滞后 GitHub 13.34.2）、@opengsd/gsd-core@1.14.0（滞后 1.16.0）、gitnexus@1.6.9（滞后 1.6.12；PolyForm 非商用——用户指令豁免）、两个宿主 CLI（@anthropic-ai/claude-code@2.1.294、@openai/codex@0.160.0，可选）。

pip 通道：**graphifyy==0.9.80**——PyPI 真名双 y（本机 dist-info 实证），裸名 graphify 无任何版本（占位）、npm 同名是异源旧分支（upstream-baseline 通道陷阱①）。

github 通道（不入 vendor，离线不可得→降级）：comet（无可靠 npm 通道）、superpowers/gstack（方法论纯文档，无需安装）。

## 三、本轮实录坑（已修，守门测试锁）

1. **`$rt（`全角紧跟 unbound**（构建器 vendor 循环三处）：本仓记忆登记的 bash 3.2 坑由我本人实录——`set -u` 下 `$rt` 后跟全角括号即 unbound 中止。修为 `${rt}`；test-r104 ②2e 对构建器做全角紧跟扫描锁。
2. **brew pip 坏解释器**：`/opt/homebrew/bin/pip` 指向已消失的 python@3.10（与本轮 zsh ENOENT 同源——brew 升级挪走旧 python）。构建器与安装器一律 `python3 -m pip`。
3. **Desktop TCC**：重启后的 ZCode 无「文件与文件夹」授权，构建产物可写不可读——验收路径改用非保护目录；Desktop 副本用户侧可见。

## 四、验证

test-r104-offline-bundle（清单格式/通道陷阱锁/构建器语法与关键内容/安装器模板 16 断言）；实包构建 9/9 vendor + 隔离假 HOME 验收（安装→SKILL.md→precheck 可执行→spec-first-lib 在位）记录如上。run-sweep 全量见 CHANGELOG v2.67.0。
