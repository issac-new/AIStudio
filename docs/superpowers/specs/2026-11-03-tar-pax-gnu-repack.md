# 2026-11-03 源码包 PAX 头清除（GNU 格式重打，R147）

## 变更

`scripts/make-release-packages.mjs`：`git archive` 产出后经 Python tarfile 以 **GNU_FORMAT** 重打（长路径走 `@LongLink` 机制）。三包 pax 扩展头 60/119/若干 → **全部 0**。

## 决策记录

- **现象（用户发现）**：源码包用 7-Zip 等工具解压出现大量 `.paxheader` 文件（yuan-skill 60 条、full 119 条）；标准 tar 工具（GNU tar/bsdtar/Python tarfile）透明处理不可见。
- **根因**：`vendor-knowledge/pay-team/references/standards/PBOC3_*` 等中文文件名 UTF-8 编码 139-146 字节，超过 ustar 格式 100 字节路径上限 → `git archive` 按 POSIX 标准产出 PAX 扩展头（type-x 条目 `<sha>.paxheader`）。**非打包错误，是格式标准的副作用**——但 7-Zip 等工具将元数据条目显示为实体文件，造成用户侧污染观感。
- **修法选型**：macOS bsdtar 无 `--format=gnu`（仅 pax/ustar/cpio/sh）；homebrew 安装 gtar 引入外部依赖。选 **Python tarfile `GNU_FORMAT`**——零依赖、可移植、GNU 长名机制（`@LongLink`）被所有主流工具含 7-Zip 正确处理。
- **验证实测**：重打后三包 pax 头 **0**；14 个 PBOC3 中文文件名完整可读；1639 个 >100 字节路径全部正常；SHA256SUMS 5/5 校验通过。

## 验证

- 原始 typeflag 级扫描（绕过 tarfile 抽象层）：三包 x/g 类型条目 0。
- GNU 长名提取实测：PBOC3 14 文件名完整、>100 字节路径 1639 条全部可读。
- `shasum -c SHA256SUMS` 5/5 OK。

## 设计文档影响

DESIGN_SYNC: none——打包器格式修（不改变内容），口径不变。
