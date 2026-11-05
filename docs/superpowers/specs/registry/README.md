# 规格库 registry/（主规格库，2026-11-05 AI Native 吸收批 T7 立）

Spec-Anchored Level 2 的合并正本：`scripts/spec-archive.mjs` 把含 OpenSpec delta 段
（### ADDED/MODIFIED/REMOVED Requirements）的治理 spec 合并到本目录 `<域>.md`
（域=spec 显式「## 规格域」行，缺省取文件名日期后首段）。

- 条目形态：日志式溯源追加（日期＋来源 spec 文件名），非破坏性；
- MODIFIED/REMOVED 的需求名不在既有正本时告警登记（债，不猜数）；
- 本目录是 specs 根的子目录：A.1 与 design-index 都是根目录直接文件 flat 扫描，
  registry 不进两索引（零扰动）；
- 完整归档（源 spec 移 archive/＋A.1 删行）用 `--move`，默认只盖章不动文件。

本 README 不是 spec，不进 A.1。
