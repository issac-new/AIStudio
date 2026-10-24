#!/bin/bash
# 守门：同类风险收敛性对账（方案 V8.26 §4.3-51）三面同步——复盘模板（templates-pending）
# ↔ 生成器（aipay-scenario.sh 步 24 heredoc）↔ 覆盖对照表。任一面漂移即 FAIL，
# 防「方案立了纪律、模板与生成器没跟上」的立法即遗忘（模板↔harness 双向同步纪律）。
set -u
cd "$(dirname "$0")/../.."
fails=0

ck() { # ck <名> <文件> <锚正则>
  if grep -qE "$3" "$2"; then echo "PASS $1"; else echo "FAIL $1（$2 缺锚：$3）"; fails=1; fi
}
ckf() { # ckf <名> <文件> <锚字面量（固定串匹配，awk/正则元字符免转义）>
  if grep -qF "$3" "$2"; then echo "PASS $1"; else echo "FAIL $1（$2 缺锚：$3）"; fails=1; fi
}

# ① 复盘模板：对账节 + 表列 + 机械判据第 7 行
ck "模板·对账节在场" mux/templates-pending/retrospective.md '同类风险收敛性对账（方案 V8\.26 §4\.3-51'
ck "模板·表五列" mux/templates-pending/retrospective.md '\| 风险族（同类指纹） \| 上轮复发 \| 本轮复发 \| 趋势 \| 熵增处置 \|'
ck "模板·机械判据" mux/templates-pending/retrospective.md '\| 7 \| 同类风险收敛对账表在场；熵增趋势行均有处置 \| 逐行存在性 \|'
ck "模板·禁编造句" mux/templates-pending/retrospective.md '缺位如实标注，禁编造'

# ② 生成器 heredoc：同节 + 族计数机械实算 + 巡检官收敛账 fail-soft 引用
ck "生成器·对账节" aipay-scenario.sh '同类风险收敛性对账（纪律 51'
ckf "生成器·族计数" aipay-scenario.sh '/^ISSUE\|/{c[$2]++}'
ck "生成器·收敛账引用" aipay-scenario.sh 'cluster-inspector-convergence\.json'
ck "生成器·缺位如实" aipay-scenario.sh '收敛账未在位（产品面未部署或 CLUSTER_INSPECTOR_CONVERGENCE=off）'

# ③ 覆盖对照表：纪律 51 行同批登记
ck "对照表·51 登记" mux/discipline-test-coverage.md '^\| 51 \| 同类风险收敛性判定'

# ④ 语法自检（heredoc 改动必过 bash -n——纪律 19 同款）
if bash -n aipay-scenario.sh 2>/dev/null; then echo "PASS 生成器 bash -n"; else echo "FAIL aipay-scenario.sh 语法"; fails=1; fi

[ "$fails" -eq 0 ] && echo 'PASS retro-convergence-gate（模板/生成器/对照表三面同步）'
exit "$fails"
