#!/usr/bin/env bash
# 基线提交后只做收紧（阈值上调 + 新增断言），另删一个 vendor 下的测试文件 → 期望 pass。
# vendor 是钉版基线，上游升级删测试文件不是本仓的降标动作（2026-11-24 复盘：该排除曾因
# 记录键带 a/ 前缀而从未生效，另一会话的 ZCode 基线升级因此在本夹具外的 summary 组误红）。
set -u
rm -rf .git precheck.conf a.test.js vendor
git init -q
git symbolic-ref HEAD refs/heads/main
printf 'COV_MIN=60\n' > precheck.conf
printf 'test("a", () => { expect(1).toBe(1) })\n' > a.test.js
mkdir -p vendor/x
printf 'test("v", () => { expect(1).toBe(1) })\n' > vendor/x/v.test.js
git add precheck.conf a.test.js vendor/x/v.test.js
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
printf 'COV_MIN=80\n' > precheck.conf
printf 'test("a", () => { expect(1).toBe(1) })\ntest("b", () => { expect(2).toBe(2) })\n' > a.test.js
rm vendor/x/v.test.js
