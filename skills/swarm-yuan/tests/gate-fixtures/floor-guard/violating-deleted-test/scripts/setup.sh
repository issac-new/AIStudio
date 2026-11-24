#!/usr/bin/env bash
# 运行时造一个最小 git 仓库：基线提交后删除一个本仓测试文件（未提交）→ 期望 fail。
# 与 compliant 组对照：排除只针对 vendor/，删本仓测试文件仍须被拦（防止排除规则放宽过头）。
set -u
rm -rf .git precheck.conf a.test.js b.test.js
git init -q
git symbolic-ref HEAD refs/heads/main
printf 'COV_MIN=80\n' > precheck.conf
printf 'test("a", () => { expect(1).toBe(1) })\n' > a.test.js
printf 'test("b", () => { expect(2).toBe(2) })\n' > b.test.js
git add precheck.conf a.test.js b.test.js
git -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false commit -q -m "基线提交"
rm b.test.js
