#!/usr/bin/env bash
# run-one-fixture.sh <swarm-yuan_dir> <fixture_id>
# 委托唯一框架执行器：stdout=<violating_rc> <compliant_rc> <assertion_failures>。
# 退出码原样转发：0=双态全过，1=断言失败，2=输入/执行异常；诊断在 stderr。
set -u
[[ $# -eq 2 ]] || { echo "用法: run-one-fixture.sh <swarm-yuan_dir> <fixture_id>" >&2; exit 2; }
exec bash "$1/tests/run-framework-fixture.sh" --machine "$2"
