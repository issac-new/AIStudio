#!/usr/bin/env bash
# 基线提交后只做收紧（阈值上调 + 新增断言）→ 期望 pass
set -u
rm -rf .git precheck.conf a.test.js
git init -q
git symbolic-ref HEAD refs/heads/main
printf 'COV_MIN=60\n' > precheck.conf
printf 'test("a", () => { expect(1).toBe(1) })\n' > a.test.js
git add precheck.conf a.test.js
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
printf 'COV_MIN=80\n' > precheck.conf
printf 'test("a", () => { expect(1).toBe(1) })\ntest("b", () => { expect(2).toBe(2) })\n' > a.test.js
