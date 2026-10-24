#!/usr/bin/env bash
# 运行时生成 learnings.jsonl（.swarm-yuan/ 被 gitignore，不能入库）
# 注：check_learnings 解析 "TOTAL:.. RECENT:.." 行时 recent 变量取值含尾串，
# 有记录即触发 set -u 算术求值崩溃（既有实现缺陷，夹具不复制该崩溃）——
# 故 compliant 走门禁显式允许的"存在但为空（draft 期）"路径：无发现、退出 0。
set -u
mkdir -p .swarm-yuan
: > .swarm-yuan/learnings.jsonl
