# mx-clean 固化 LC_ALL=C——bash 3.2 UTF-8 locale 陷阱自免疫

日期：2026-10-28 ｜ 状态：已实施 ｜ 关联：run23 清场轮（消除历史推演数据污染）；同族坑=awk-utf8-multibyte-locale-trap / 驱动侧 prelude 统一 LC_ALL=C

## 变更

`simharness/mux/mx-clean.sh` 头部（`set -euo pipefail` 后）固化 `export LC_ALL=C`。

## 决策记录

- D1 根因实测：mx-clean 默认 locale（UTF-8）下运行在评测存储归档段（line 175-181 for 循环，中文 say 文案）两度确定性崩溃报 `line 178: _ed: unbound variable`（变量名字节核验干净、循环作用域正常——bash 3.2 对多字节串的解析陷阱）；`LC_ALL=C` 环境下同命令一击即过（rc=0 完整清场）。与 prelude 要求所有 bash 驱动带 `LC_ALL=C` 同源。
- D2 固化进脚本本体而非依赖调用方带 env：mx-clean 可能被人工/自动化以任意姿势调用，locale 自免疫属脚本自身健壮性；一行 export 无副作用（脚本输出全 ASCII 安全；中文文案仅日志显示层面受 C locale 影响可接受）。

## 验证

- 修复前：`MX_CLEAN_CONFIRM_PROD=1 bash mux/mx-clean.sh --apply --reset-central --reset-workspaces` 两复现 line 178 unbound 崩溃（清场半途而废：runs/看板已清、中央仓/工作区未达）。
- 修复后（外部 LC_ALL=C 实证同语义）：完整清场 rc=0——中央仓九目录零残留＋历史截断（run22 分支 tag 归档后删）、workspaces tar 归档重置、runs/state/看板/运行态全清。
- 脚本本体固化后 `bash -n` 通过；后续清场不再依赖外部 env。

## 设计文档影响

DESIGN_SYNC: none——清场工具自免疫加固，不触及方案判据与契约面。
